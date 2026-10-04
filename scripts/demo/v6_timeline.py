"""데모 영상(v6)의 시간 계산 — 녹화 시각 → 영상 시각, 문장 자막 시간, 마우스 따라 확대 경로.

edit-v6.py가 쓴다. 기준 문서: `Blink 데모 시나리오/v6/04-자막-카드-확대.md`, `08-대본-중심-시연표.md`
"""
import json
import math
from bisect import bisect_right
from pathlib import Path

import numpy as np

FPS = 30
W, H = 1920, 1080  # 설계 좌표 (미리보기는 마지막에 줄인다)

# ── 영상 구성 (08 시연표 시간표) ─────────────────────────────────────
S02_AT = 10.0  # S02 애니메이션 시작 (render-cards.cjs가 9초를 그린다)
S03_AT = 19.0  # 빈 포스터 양식
FOOTAGE_XFADE = 2.0  # 0:24–0:26 양식 → 앱 첫 화면 크로스페이드
FOOTAGE_AT = 26.0  # S04 시작
PDF_LEN = 6.5  # S13 PDF 화면: 6초 확대 + 마지막 0.5초 페이드아웃
PDF_XFADE = 0.4

# ── 속도 조절 (04 문서 §4) ────────────────────────────────────────
KEEP = 0.75  # AI 대기 앞뒤로 제 속도로 남길 초
WAIT_SPEED = 4.0  # 대기 가운데 배속
FIT_TOTAL = 178.0  # 전체 길이 목표 (2:58). 넘으면 녹화가 ⏱+20%를 넘긴 문장만 조금 빠르게
FIT_MAX = 2.0  # 맞추기로 더 빠르게 할 수 있는 최대 배율

# ── 마우스 따라 확대 (04 문서 §3): 문장 번호 → 배율과 선택 사항 ─────────────────
#   start: 'wait-start'/'wait-end' — 문장 안의 그 표시부터 (기본: 문장 시작)
#   until: (다음 문장, 초) — 그 문장 시작 + 초(녹화 시각)까지 이어서 (기본: 문장 끝)
#   focus: (x, y) CSS px — 커서 대신 이 점을 중심으로
#   marker: 녹화가 남긴 focus-start(이름·영역)~focus-end 사이만 확대하고, 그 영역 가운데를 본다 (끝난 뒤 0.8초 더)
ZOOM = {
    'S05-2': {'scale': 1.25},
    # 미리보기 목록: 목록이 뜬 순간부터, 다음 문장에서 커서가 목록을 훑는 동안까지. 커서는 사이드바에 있어 목록 가운데를 본다
    'S07-2': {'scale': 1.2, 'start': 'wait-end', 'until': ('S07-3', 2.5), 'focus': (720, 455)},
    # 글을 선택하면 뜨는 AI 도구 막대(Expand·Organize·Visualize): 막대가 뜬 순간부터 누른 직후까지 막대를 가운데에
    'S08-2': {'scale': 1.4, 'marker': 'ai-toolbar'},
    'S08-3': {'scale': 1.15},
    'S09-3': {'scale': 1.4, 'marker': 'ai-toolbar'},
    'S09-4': {'scale': 1.15},
    'S10-2': {'scale': 1.2},
    'S11-2': {'scale': 1.4, 'marker': 'ai-toolbar'},
    'S11-4': {'scale': 1.2},
    'S12-1': {'scale': 1.15},
    'S13-1': {'scale': 1.15, 'start': 'wait-start'},  # 미리보기 창이 뜬 뒤 ~ Export
}
ZOOM_RAMP = 0.4  # 들어갈 때·나올 때
FOLLOW_TAU = 0.22  # 화면이 커서를 따라가는 부드러움 (초, 앞뒤 두 번 거른다)

# ── 대본 (08 표의 "말" 칸, 호흡 표시 `/` 제거): 번호 → (⏱초, 문장) ─────────────
SENTENCES = {
    'S01-1': (8, 'Hello. For our Software Engineering Phase 1 project, we chose AI Note Organizer and developed Blink, an AI-powered desktop note app.'),
    'S02-1': (5, 'Using AI while writing usually means switching apps, copying text, and pasting it back.'),
    'S02-2': (2.5, 'We wanted to make that process simpler.'),
    'S03-1': (5, "Today, we'll use Blink itself to create our Software Engineering Phase 1 poster."),
    'S04-1': (2, "First, let's open our workspace."),
    'S04-2': (2.5, 'Blink stores each note as a Markdown file.'),
    'S05-1': (2, "Before we start, let's set up AI."),
    'S05-2': (4.5, 'Blink supports your own OpenAI or Kimi API key, with a model of your choice.'),
    'S06-1': (1.5, "Now we're ready."),
    'S06-2': (4.5, 'We can create notes and folders, edit freely, and everything saves automatically.'),
    'S06-3': (5, "Let's create our poster note, bring in the template, and remove a note we no longer need."),
    'S07-1': (3, 'Before writing, our class notes need some cleanup.'),
    'S07-2': (4, 'AI Folder Organization analyzes the notes and suggests folders by topic.'),
    'S07-3': (5, 'We preview the proposed structure, confirm the moves, and everything is neatly organized.'),
    'S08-1': (2.5, "With our notes in order, let's study one."),
    'S08-2': (5, 'We only half remember what Agile means, so we write down what we think and click Expand.'),
    'S08-3': (4, 'Blink researches it and explains it clearly, with sources we can check.'),
    'S09-1': (3, 'Now, back to our poster, starting with the Description.'),
    'S09-2': (3.5, 'All we have is a messy kickoff memo, not a polished introduction.'),
    'S09-3': (5, 'We select it and click Organize. While the selection blinks, we can keep working.'),
    'S09-4': (4, 'A moment later, it becomes a clear description, right where we were writing.'),
    'S10-1': (4, "We've already documented each feature in its own note, with screenshots for the key ones."),
    'S10-2': (6, 'Instead of writing them again, search by title or content, preview the results, and choose Link or Import.'),
    'S10-3': (5, "We'll import the feature descriptions and screenshots straight into the Key Features section."),
    'S11-1': (1.5, 'Next is the architecture.'),
    'S11-2': (6, 'We already described our structure in another note, so we import the whole text at once, select it, and click Visualize.'),
    'S11-3': (2, 'Blink turns it into an editable diagram.'),
    'S11-4': (2.5, 'Move a component, and its connections follow.'),
    'S11-5': (2, 'It can also be downloaded as a PNG.'),
    'S12-1': (7, 'Blink uses Electron, React, and Tiptap for its editor, Node.js and SQLite for local operations, and the OpenAI SDK for AI.'),
    'S12-2': (2.5, 'We built it with Claude Code on Windows 11.'),
    'S13-1': (4.5, 'Finally, we export the finished poster as a single-page PDF.'),
    'S13-2': (2, "Here's the file, ready to print and submit."),
    'S13-3': (2.5, 'That concludes our Blink demo. Thank you.'),
}
# 카드 장면의 문장은 녹화가 없으므로 시간표대로 (영상 시각). S13-2·3은 PDF 화면 시작 기준
PLANNED = {'S01-1': (1.0, 9.6), 'S02-1': (10.3, 16.0), 'S02-2': (16.2, 18.9), 'S03-1': (19.2, 25.8)}
PLANNED_PDF = {'S13-2': (0.3, 2.7), 'S13-3': (2.9, PDF_LEN)}


def ease(k: float) -> float:
    """부드러운 가속·감속 (0→1)"""
    k = min(1.0, max(0.0, k))
    return k * k * (3 - 2 * k)


class Timeline:
    """녹화 폴더 하나의 시간표. 녹화 시각 t(초, t0 기준) ↔ 영상 시각 T"""

    def __init__(self, run: Path, fit_total: float | None = FIT_TOTAL):
        load = lambda name: json.loads((run / name).read_text(encoding='utf8'))
        meta = load('frames.json')
        self.markers = load('markers.json')
        cursor = load('cursor.json')
        self.lines = {l['id']: l for l in load('lines.json')}
        self.frame_names = [f['name'] for f in meta['frames']]
        self.frame_times = [f['t'] - meta['t0'] for f in meta['frames']]

        # 녹화 구간: S04 장면 시작 ~ S13-1 끝 (S13-2·3은 PDF 화면)
        self.start = next(m['t'] for m in self.markers if m['type'] == 'scene')
        self.end = self.lines['S13-1']['end'] if 'S13-1' in self.lines else self.markers[-1]['t']
        self.footage_lines = [l for l in self.lines.values() if l['start'] >= self.start - 0.01 and l['end'] <= self.end + 0.01]

        # 빠르게 할 구간 [(a, b, 배속)]: AI 대기는 앞뒤 KEEP초를 남기고 가운데만, fast는 통째로
        self.spans = []
        opened = {}
        for m in self.markers:
            kind = m['type']
            if kind in ('wait-start', 'fast-start'):
                opened[kind] = m
            elif kind == 'wait-end' and 'wait-start' in opened:
                a, b = opened.pop('wait-start')['t'] + KEEP, m['t'] - KEEP
                if b > a:
                    self.spans.append((a, b, WAIT_SPEED))
            elif kind == 'fast-end' and 'fast-start' in opened:
                self.spans.append((opened.pop('fast-start')['t'], m['t'], m['factor']))

        # 녹화가 ⏱+20%를 넘긴 문장을 얼마나 더 빠르게 할지 (전체가 fit_total을 넘을 때만)
        self.line_speed = {l['id']: 1.0 for l in self.footage_lines}
        self.fit_cap = 1.0
        if fit_total:
            budget = fit_total - FOOTAGE_AT - PDF_LEN
            if self._length(self._speeds(1.0)) > budget:
                lo, hi = 1.0, FIT_MAX
                if self._length(self._speeds(hi)) > budget:
                    lo = hi  # 최대로 빠르게 해도 넘는다 — 최대 배율로
                for _ in range(40):
                    mid = (lo + hi) / 2
                    lo, hi = (lo, mid) if self._length(self._speeds(mid)) <= budget else (mid, hi)
                self.fit_cap = hi
                self.line_speed = self._speeds(hi)
        self._build_map(self.line_speed)

        # 커서 (CSS px, 1440×810) → 설계 좌표
        view = cursor['view']
        self.view = (view['width'], view['height'])
        pts = cursor['points'] or [{'t': 0, 'x': view['width'] / 2, 'y': view['height'] / 2}]
        self.cur_t = np.array([p['t'] for p in pts])
        self.cur_x = np.array([p['x'] for p in pts]) * W / view['width']
        self.cur_y = np.array([p['y'] for p in pts]) * H / view['height']
        self._build_camera()

    # ── 시간 바꾸기 ────────────────────────────────────────────────
    def base(self, t: float) -> float:
        """대기·fast만 줄인 시각 (문장 맞추기 전)"""
        out = t
        for a, b, f in self.spans:
            if t > b:
                out -= (b - a) * (1 - 1 / f)
            elif t > a:
                out -= (t - a) * (1 - 1 / f)
        return out

    def _speeds(self, cap: float) -> dict:
        speeds = {}
        for l in self.footage_lines:
            over = (self.base(l['end']) - self.base(l['start'])) / l['target']
            speeds[l['id']] = min(max(over, 1.0), cap)
        return speeds

    def _knots(self):
        ts = {self.start, self.end}
        ts.update(x for a, b, _ in self.spans for x in (a, b))
        ts.update(x for l in self.footage_lines for x in (l['start'], l['end']))
        return sorted(t for t in ts if self.start <= t <= self.end)

    def _segments(self, speeds):
        """(a, b, 길이) — 사이 구간마다 대기·fast와 문장 배속이 일정하다"""
        knots = self._knots()
        for a, b in zip(knots, knots[1:]):
            mid = (a + b) / 2
            line = next((l for l in self.footage_lines if l['start'] <= mid < l['end']), None)
            speed = speeds[line['id']] if line else 1.0
            yield a, b, (self.base(b) - self.base(a)) / speed

    def _length(self, speeds) -> float:
        return sum(d for _, _, d in self._segments(speeds))

    def _build_map(self, speeds):
        raw, out = [self.start], [0.0]
        for _, b, d in self._segments(speeds):
            raw.append(b)
            out.append(out[-1] + d)
        self.map_raw, self.map_out = np.array(raw), np.array(out)
        self.footage_len = float(out[-1])
        self.pdf_at = FOOTAGE_AT + self.footage_len
        self.total = self.pdf_at + PDF_LEN

    def video(self, t: float) -> float:
        """녹화 시각 → 영상 시각"""
        return FOOTAGE_AT + float(np.interp(t, self.map_raw, self.map_out))

    def raw(self, u: float) -> float:
        """녹화 영상 안의 시각 u(0 = S04 시작) → 녹화 시각"""
        return float(np.interp(u, self.map_out, self.map_raw))

    def frame_for(self, t: float) -> str:
        """녹화 시각 t에 화면에 있던 프레임 (화면이 바뀔 때만 프레임이 온다 → 직전 것)"""
        return self.frame_names[max(0, bisect_right(self.frame_times, t) - 1)]

    # ── 문장 자막 ─────────────────────────────────────────────────
    def subtitles(self):
        """[(번호, 시작, 끝, 문장)] 영상 시각"""
        subs = [(i, a, b) for i, (a, b) in PLANNED.items()]
        subs += [(l['id'], self.video(l['start']), self.video(l['end'])) for l in self.footage_lines]
        subs += [(i, self.pdf_at + a, self.pdf_at + b) for i, (a, b) in PLANNED_PDF.items()]
        return [(i, a, b, SENTENCES[i][1]) for i, a, b in subs]

    # ── 마우스 따라 확대 ──────────────────────────────────────────────
    def zoom_segments(self):
        """[(시작, 끝, 배율, 중심 또는 None)] 영상 시각"""
        segs = []
        for i, opt in ZOOM.items():
            line = self.lines.get(i)
            if line not in self.footage_lines:
                continue
            a, b = line['start'], line['end']
            if 'start' in opt:
                a = next((m['t'] for m in self.markers if m['type'] == opt['start'] and a <= m['t'] <= b), a)
            if 'until' in opt and opt['until'][0] in self.lines:
                nxt, extra = opt['until']
                b = min(self.lines[nxt]['start'] + extra, self.lines[nxt]['end'])
            focus = opt.get('focus')
            if 'marker' in opt:
                begin = next((m for m in self.markers if m['type'] == 'focus-start' and m.get('name') == opt['marker'] and a <= m['t'] <= b), None)
                if not begin:
                    continue
                done = next((m for m in self.markers if m['type'] == 'focus-end' and m.get('name') == opt['marker'] and m['t'] >= begin['t']), None)
                a, b = begin['t'], (done['t'] if done else b) + 0.8
                r = begin['rect']
                focus = (r['x'] + r['width'] / 2, r['y'] + r['height'] / 2)
            segs.append((self.video(a), self.video(b), opt['scale'], focus))
        return sorted(segs)

    def _zoom_keys(self):
        """배율 키프레임 [(T, 배율)] — 붙어 있는 구간은 1배로 내려가지 않고 바로 다음 배율로"""
        keys = [(0.0, 1.0)]
        segs = self.zoom_segments()
        for n, (a, b, s, _) in enumerate(segs):
            ramp = min(ZOOM_RAMP, (b - a) / 2)
            keys += [(a, keys[-1][1]), (a + ramp, s)]
            joined = n + 1 < len(segs) and segs[n + 1][0] - b < 0.05
            keys += [(b, s)] if joined else [(b - ramp, s), (b, 1.0)]
        return keys

    def zoom_at(self, T: float, keys) -> float:
        for (a, va), (b, vb) in zip(keys, keys[1:]):
            if a <= T <= b:
                return va + (vb - va) * ease((T - a) / (b - a)) if b > a else vb
        return keys[-1][1] if T > keys[-1][0] else 1.0

    def _build_camera(self):
        """녹화 영상 프레임마다 (중심 x, y, 배율) — 커서를 부드럽게 따라가고 화면 밖이 보이지 않게"""
        n = int(math.ceil(self.footage_len * FPS)) + 1
        u = np.arange(n) / FPS
        t = np.interp(u, self.map_out, self.map_raw)
        x = np.interp(t, self.cur_t, self.cur_x)
        y = np.interp(t, self.cur_t, self.cur_y)
        # 중심을 정해 둔 구간은 커서 대신 그 점 (앞뒤로 들어가고 나오는 동안까지)
        for a, b, _, focus in self.zoom_segments():
            if focus:
                inside = (FOOTAGE_AT + u >= a - ZOOM_RAMP) & (FOOTAGE_AT + u <= b + ZOOM_RAMP)
                x[inside], y[inside] = focus[0] * W / self.view[0], focus[1] * H / self.view[1]
        k = 1 - math.exp(-1 / (FPS * FOLLOW_TAU))
        for arr in (x, y):  # 앞으로 한 번, 뒤로 한 번 걸러 늦지 않게 따라간다
            for rng in (range(1, n), range(n - 2, -1, -1)):
                step = 1 if rng.step > 0 else -1
                for i in rng:
                    arr[i] = arr[i - step] + (arr[i] - arr[i - step]) * k
        keys = self._zoom_keys()
        s = np.array([self.zoom_at(FOOTAGE_AT + v, keys) for v in u])
        hw, hh = W / 2 / s, H / 2 / s
        self.cam = np.stack([np.clip(x, hw, W - hw), np.clip(y, hh, H - hh), s], axis=1)

    def camera(self, u: float):
        i = min(len(self.cam) - 1, max(0, round(u * FPS)))
        return tuple(self.cam[i])
