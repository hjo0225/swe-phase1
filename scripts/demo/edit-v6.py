"""Blink 데모 영상(v6) 편집 — 카드·애니메이션 + 녹화 + PDF 화면, 대본 자막, 마우스 따라 확대, 대기 단축.

    C:/Python310/python.exe scripts/demo/edit-v6.py <녹화 결과 폴더> [옵션]

  --preview          빠른 확인: 절반 해상도(960×540), 녹음용 영상은 만들지 않는다
  --range 55:75      이 구간(영상 초)만 렌더링
  --stills 5,14,...  이 시각들의 정지 화면 PNG만 만든다 (<폴더>/edit/stills)
  --no-fit           전체 길이를 맞추려고 문장을 빠르게 하지 않는다
  --cards            카드·애니메이션을 다시 그린다 (render-cards.cjs)

입력: record-demo.mjs 결과 (frames/, frames.json, markers.json, cursor.json, lines.json, Blink_Phase1_Poster.pdf)
출력 (<폴더>/edit/):
  Blink-Demo.mp4                  최종 무음 영상 1920×1080 30fps H.264 (대본 자막 34px)
  Blink-Demo-narration.mp4        녹음용 미리보기 — 같은 영상에 큰 자막(48px)
  lines.srt, lines.csv, lines.md  문장별 시작 시각 (녹음·합치기용)
  timeline.json                   시간 계산 결과 (문장 배속, 확대 구간 등)
필요: Pillow, numpy, PyMuPDF(import pymupdf), ffmpeg (PATH)
"""
import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.dont_write_bytecode = True  # 저장소에 __pycache__를 남기지 않는다
sys.path.insert(0, str(Path(__file__).resolve().parent))
from v6_timeline import (FOOTAGE_AT, FOOTAGE_XFADE, FPS, H, PDF_LEN, PDF_XFADE, S02_AT, S03_AT, SENTENCES, W,  # noqa: E402
                         Timeline, ease)

REPO = Path(__file__).resolve().parents[2]
FONT = 'C:/Windows/Fonts/SegUIVar.ttf'  # Segoe UI Variable
NAVY = (16, 33, 61)

# ── 대본 자막 (04 문서 §1) ───────────────────────────────────────
SUB_BOTTOM = 56  # 아래 여백
SUB_FADE = 0.15
SUB_OPACITY = 0.70


def font(size: float, weight: str = 'Semibold Display') -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, max(8, round(size)))
    f.set_variation_by_name(weight)
    return f


def wrap(text: str, f, max_width: float, max_lines: int) -> list[str]:
    """한 줄에 들어가면 한 줄, 아니면 두 줄을 비슷한 길이로 나눈다 (그래도 넘치면 더 나눈다)"""
    if f.getlength(text) <= max_width:
        return [text]
    words = text.split()
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        width = max(f.getlength(a), f.getlength(b))
        if width <= max_width and (best is None or width < best[0]):
            best = (width, [a, b])
    if best or max_lines <= 2:
        return best[1] if best else [text]
    lines, cur = [], ''
    for w in words:  # 세 줄 이상: 앞에서부터 채운다 (녹음용 큰 자막에서만)
        if cur and f.getlength(f'{cur} {w}') > max_width:
            lines.append(cur)
            cur = w
        else:
            cur = f'{cur} {w}'.strip()
    return lines + [cur]


def subtitle_image(text: str, px: float, scale: float, max_lines: int) -> Image.Image:
    """반투명 남색 상자 + 흰 글자 (RGBA)"""
    size = px * scale
    f = font(size)
    lines = wrap(text, f, (1500 if px < 40 else 1720) * scale, max_lines)
    lh = size * 1.32
    pad_x, pad_y = size * 0.85, size * 0.42
    width = max(f.getlength(line) for line in lines) + 2 * pad_x
    height = lh * len(lines) + 2 * pad_y
    im = Image.new('RGBA', (round(width), round(height)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=size * 0.38, fill=(*NAVY, round(255 * SUB_OPACITY)))
    for n, line in enumerate(lines):
        draw.text((im.width / 2, pad_y + lh * (n + 0.5)), line, font=f, fill=(255, 255, 255, 255), anchor='mm')
    return im


class Subtitles:
    def __init__(self, subs, px: float, scale: float, max_lines: int):
        self.items = [(a, b, subtitle_image(text, px, scale, max_lines)) for _, a, b, text in subs]
        self.bottom = SUB_BOTTOM * scale

    def draw(self, frame: Image.Image, T: float):
        for a, b, im in self.items:
            if a <= T < b:
                k = min(1.0, (T - a) / SUB_FADE, (b - T) / SUB_FADE)
                alpha = im.getchannel('A')
                if k < 1:
                    alpha = alpha.point(lambda v: round(v * k))
                pos = (round((frame.width - im.width) / 2), round(frame.height - self.bottom - im.height))
                frame.paste(im.convert('RGB'), pos, alpha)


# ── 화면 만들기 ──────────────────────────────────────────────────
class Renderer:
    def __init__(self, run: Path, tl: Timeline, out_w: int, out_h: int):
        self.run, self.tl = run, tl
        self.size = (out_w, out_h)
        self.scale = out_w / W
        cards = run / 'edit' / 'cards'
        self.s01 = self._card(cards / 's01.png')
        self.s03 = self._card(cards / 's03.png')
        self.s02_frames = sorted((cards / 's02').glob('*.png'))
        self.black = Image.new('RGB', self.size)
        self._cache = {}
        self._pdf_setup(cards / 'bg.png')

    def _card(self, path: Path) -> Image.Image:
        return Image.open(path).convert('RGB').resize(self.size, Image.LANCZOS)

    def _cached(self, key, make):
        """같은 화면이 이어질 때 다시 만들지 않는다 (작은 캐시)"""
        if key not in self._cache:
            if len(self._cache) > 6:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = make()
        return self._cache[key]

    # S13 PDF 화면: 실제 PDF 1페이지를 종이 그림자와 함께, 2배 크기로 한 번 그려 두고 프레임마다 잘라 줄인다
    def _pdf_setup(self, bg_path: Path):
        pdf_path = self.run / 'Blink_Phase1_Poster.pdf'
        doc = pymupdf.open(pdf_path)
        page = doc[0]
        k = 2  # 104%까지 확대해도 선명하게
        paper_h = 920 * k
        top = 34 * k
        pix = page.get_pixmap(matrix=pymupdf.Matrix(paper_h / page.rect.height, paper_h / page.rect.height), alpha=False)
        paper = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        canvas = Image.open(bg_path).convert('RGB').resize((W * k, H * k), Image.BICUBIC)
        x = (canvas.width - paper.width) // 2
        shadow = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(shadow).rectangle((x, top + 22 * k, x + paper.width, top + paper.height + 22 * k), fill=70)
        shadow = shadow.filter(ImageFilter.GaussianBlur(30 * k))
        ImageDraw.Draw(shadow).rectangle((x - 1, top - 1 + 2 * k, x + paper.width + 1, top + paper.height + 2 * k), fill=40)
        canvas.paste(Image.new('RGB', canvas.size, NAVY), (0, 0), shadow)
        canvas.paste(paper, (x, top))
        self.pdf_canvas = canvas
        self.pdf_center = (W * k / 2, top + paper.height / 2)
        # 오른쪽 아래 작은 글씨 (확대하지 않는다)
        w, h = page.rect.width, page.rect.height
        a4 = abs(min(w, h) - 595) < 6 and abs(max(w, h) - 842) < 6
        n = doc.page_count
        label = f"{pdf_path.name} · {n} page{'s' if n > 1 else ''}" + (' · A4' if a4 else '')
        f = font(22 * self.scale, 'Regular Display')
        self.pdf_label = (label, f)

    def pdf(self, v: float) -> Image.Image:
        z = 1 + 0.04 * ease(v / 6.0)
        k = self.pdf_canvas.width / W
        cx, cy = self.pdf_center
        hw, hh = W * k / 2 / z, H * k / 2 / z
        cx = min(max(cx, hw), self.pdf_canvas.width - hw)
        cy = min(max(cy, hh), self.pdf_canvas.height - hh)
        im = self.pdf_canvas.resize(self.size, Image.BICUBIC, box=(cx - hw, cy - hh, cx + hw, cy + hh))
        label, f = self.pdf_label
        ImageDraw.Draw(im).text((self.size[0] - 44 * self.scale, self.size[1] - 34 * self.scale), label, font=f,
                                fill=(64, 83, 110), anchor='rs')
        return im

    def footage(self, u: float) -> Image.Image:
        """녹화 영상 u초 (0 = S04 시작). 확대 중이면 커서 주변을 잘라 키운다"""
        u = min(max(u, 0.0), self.tl.footage_len)
        name = self.tl.frame_for(self.tl.raw(u))
        cx, cy, s = self.tl.camera(u)
        box = (round(cx - W / 2 / s, 2), round(cy - H / 2 / s, 2), round(cx + W / 2 / s, 2), round(cy + H / 2 / s, 2))

        def make():
            src = self._source(name)
            sx, sy = src.width / W, src.height / H
            return src.resize(self.size, Image.BICUBIC, box=(box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy))

        return self._cached((name, box), make).copy()

    def _source(self, name: str) -> Image.Image:
        return self._cached(('src', name), lambda: Image.open(self.run / 'frames' / name).convert('RGB'))

    def s02(self, v: float) -> Image.Image:
        i = min(len(self.s02_frames) - 1, max(0, int(v * FPS)))
        return self._cached(('s02', i), lambda: self._card(self.s02_frames[i])).copy()

    def frame(self, T: float) -> Image.Image:
        """자막 없는 화면. 장면 사이는 크로스페이드"""
        tl = self.tl
        if T < S02_AT:
            im = self.s01.copy()
            if T < 1.0:  # 검은 화면에서 페이드인
                im = Image.blend(self.black, im, ease(T / 1.0))
            return im
        if T < S03_AT:
            im = self.s02(T - S02_AT)
            return Image.blend(self.s01, im, ease((T - S02_AT) / 0.4)) if T < S02_AT + 0.4 else im
        if T < FOOTAGE_AT - FOOTAGE_XFADE:
            im = self.s03.copy()
            return Image.blend(self.s02(9.0), im, ease((T - S03_AT) / 0.4)) if T < S03_AT + 0.4 else im
        if T < tl.pdf_at:
            im = self.footage(T - FOOTAGE_AT)
            if T < FOOTAGE_AT:  # 0:24–0:26 빈 양식 → 앱 첫 화면
                im = Image.blend(self.s03, im, ease((T - (FOOTAGE_AT - FOOTAGE_XFADE)) / FOOTAGE_XFADE))
            return im
        v = T - tl.pdf_at
        im = self.pdf(v)
        if v < PDF_XFADE:
            im = Image.blend(self.footage(tl.footage_len), im, ease(v / PDF_XFADE))
        return im


def fade_out(im: Image.Image, T: float, total: float) -> Image.Image:
    """마지막 0.5초 페이드아웃 (자막까지)"""
    if T > total - 0.5:
        return Image.blend(im, Image.new('RGB', im.size), ease((T - (total - 0.5)) / 0.5))
    return im


def ffmpeg(path: Path, size, crf: int, preset: str):
    return subprocess.Popen(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{size[0]}x{size[1]}',
         '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', str(path)],
        stdin=subprocess.PIPE,
    )


# ── 녹음용 시각표 ─────────────────────────────────────────────────
def clock(t: float, srt: bool = False) -> str:
    ms = round(t * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}' if srt else f'{m}:{s:02d}.{ms // 10:02d}'


def write_tables(out: Path, tl: Timeline):
    subs = tl.subtitles()
    srt = [f'{n}\n{clock(a, True)} --> {clock(b, True)}\n{text}\n' for n, (_, a, b, text) in enumerate(subs, 1)]
    (out / 'lines.srt').write_text('\n'.join(srt), encoding='utf8')
    with open(out / 'lines.csv', 'w', newline='', encoding='utf8') as fh:
        w = csv.writer(fh)
        w.writerow(['id', 'start', 'end', 'start_s', 'end_s', 'seconds', 'planned_s', 'speed', 'text'])
        for i, a, b, text in subs:
            w.writerow([i, clock(a), clock(b), f'{a:.2f}', f'{b:.2f}', f'{b - a:.2f}', SENTENCES[i][0],
                        f'{tl.line_speed.get(i, 1.0):.2f}', text])
    md = ['# Blink 데모 v6 — 문장별 시작 시각', '',
          f'영상 길이 {clock(tl.total)} · 녹음할 때 문장이 화면 아래에 뜨는 순간 읽기 시작', '',
          '| # | 시작 | 끝 | 길이 | ⏱ | 문장 |', '|---|---|---|---|---|---|']
    md += [f'| {i} | {clock(a)} | {clock(b)} | {b - a:.1f}초 | {SENTENCES[i][0]}초 | {text} |' for i, a, b, text in subs]
    (out / 'lines.md').write_text('\n'.join(md) + '\n', encoding='utf8')
    timeline = {
        'fps': FPS, 'total': round(tl.total, 3), 'footage_at': FOOTAGE_AT, 'pdf_at': round(tl.pdf_at, 3),
        'fit_cap': round(tl.fit_cap, 3),
        'line_speed': {k: round(v, 3) for k, v in tl.line_speed.items()},
        'spans': [[round(a, 3), round(b, 3), f] for a, b, f in tl.spans],
        'zoom': [[round(a, 3), round(b, 3), s, focus] for a, b, s, focus in tl.zoom_segments()],
        'lines': [{'id': i, 'start': round(a, 3), 'end': round(b, 3)} for i, a, b, _ in subs],
    }
    (out / 'timeline.json').write_text(json.dumps(timeline, indent=2), encoding='utf8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run', type=Path)
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--range')
    ap.add_argument('--stills')
    ap.add_argument('--no-fit', action='store_true')
    ap.add_argument('--cards', action='store_true')
    args = ap.parse_args()
    run = args.run.resolve()
    out = run / 'edit'
    cards = out / 'cards'
    if args.cards or not (cards / 's01.png').exists() or not (cards / 's02').exists():
        electron = REPO / 'node_modules' / 'electron' / 'dist' / 'electron.exe'
        subprocess.run([str(electron), str(REPO / 'scripts' / 'demo' / 'render-cards.cjs'), str(cards)], check=True, cwd=REPO)

    tl = Timeline(run, None if args.no_fit else 178.0)
    write_tables(out, tl)
    print(f'total {clock(tl.total)} ({tl.total:.2f}s) · footage {tl.footage_len:.1f}s · fit cap {tl.fit_cap:.2f}x')

    size = (W // 2, H // 2) if args.preview else (W, H)
    r = Renderer(run, tl, *size)
    subs = tl.subtitles()
    main_subs = Subtitles(subs, 34, r.scale, 2)

    def still(T: float, subtitles: Subtitles) -> Image.Image:
        im = r.frame(T)
        subtitles.draw(im, T)
        return fade_out(im, T, tl.total)

    if args.stills:
        (out / 'stills').mkdir(exist_ok=True)
        for t in args.stills.split(','):
            path = out / 'stills' / f'still-{float(t):07.2f}.png'
            still(float(t), main_subs).save(path)
            print(path)
        return

    # 화면을 한 장씩 만들어 ffmpeg로 바로 흘려 보낸다 (메모리에 모아 두지 않는다)
    n_total = int(round(tl.total * FPS))
    first, last = 0, n_total
    if args.range:
        a, b = (float(x) for x in args.range.split(':'))
        first, last = int(a * FPS), min(n_total, int(b * FPS))
    suffix = ('-preview' if args.preview else '') + (f'-{args.range.replace(":", "-")}' if args.range else '')
    outputs = [(ffmpeg(out / f'Blink-Demo{suffix}.mp4', size, 18 if not args.preview else 23, 'medium'), main_subs)]
    if not args.preview:  # 녹음용: 큰 자막(48px), 최대 3줄
        outputs.append((ffmpeg(out / f'Blink-Demo-narration{suffix}.mp4', size, 23, 'veryfast'), Subtitles(subs, 48, r.scale, 3)))
    for n in range(first, last):
        T = n / FPS
        base = r.frame(T)
        for proc, subtitles in outputs:
            im = base.copy()
            subtitles.draw(im, T)
            proc.stdin.write(fade_out(im, T, tl.total).tobytes())
        if n % (FPS * 10) == 0:
            print(f'  {clock(T)} / {clock(tl.total)}', flush=True)
    for proc, _ in outputs:
        proc.stdin.close()
        if proc.wait() != 0:
            raise SystemExit('ffmpeg failed')
    print('done', ', '.join(p.args[-1] for p, _ in outputs))


if __name__ == '__main__':
    main()
