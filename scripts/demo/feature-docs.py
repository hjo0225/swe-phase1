"""녹화 결과에서 기능 문서 5개(docs/features)를 만든다 — README Key Features 문장 + 영어 화면 스크린샷 한 장씩.

스크린샷은 record-demo.mjs가 남긴 shot 표시(markers.json) 순간의 프레임이다. 데모 S10에서 이 문서들을 보관함에 넣어 쓴다.

    python scripts/demo/feature-docs.py <녹화 결과 폴더> [docs/features]
"""
import json
import sys
from pathlib import Path

from PIL import Image

RUN = Path(sys.argv[1])
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / 'docs' / 'features')
WIDTH = 1280  # 포스터에서는 한 단 폭보다 작게 그려진다 — 이 정도면 충분하다

DOCS = [
    ('01 Basic Note Management', '01. Basic Note Management (CRUD)',
     ['Create, read, update, and delete Markdown notes.', 'Manage notes and folders in a simple desktop editor.'],
     '01-notes', 'Blink main screen'),
    ('02 AI Writing Assistance', '02. AI Writing Assistance',
     ['**Organize:** Restructure rough notes into clear, organized writing.',
      '**Expand:** Enrich selected text with web-grounded explanations and sources.'],
     '02-writing', 'Expand result with sources'),
    ('03 AI Visualization', '03. AI Visualization',
     ['Transform selected text into diagrams and infographics.', 'Edit layouts and export visualizations as PNG.'],
     '03-visualize', 'Architecture diagram drawn from a memo'),
    ('04 Note Search & Reuse', '04. Note Search & Reuse',
     ['Search notes by title and content.', 'Open, link, or import existing notes into the current document.',
      'Maintain bidirectional links between related notes.'],
     '04-search', 'Search with Open, Link, Import and Preview'),
    ('05 AI Folder Organization', '05. AI Folder Organization',
     ['Automatically classify notes into relevant folders using AI.', 'Preview and confirm the suggested folder structure.'],
     '05-organize', 'Suggested folders before moving'),
]

markers = json.loads((RUN / 'markers.json').read_text(encoding='utf8'))
frames_meta = json.loads((RUN / 'frames.json').read_text(encoding='utf8'))
t0 = frames_meta['t0']
frames = [(f['name'], f['t'] - t0) for f in frames_meta['frames']]
shots = {m['name']: m for m in markers if m['type'] == 'shot'}


def frame_at(t: float) -> Path:
    """그 순간까지 화면에 보이던 마지막 프레임 (screencast는 화면이 바뀔 때만 보낸다)"""
    shown = [f for f in frames if f[1] <= t]
    name = (shown[-1] if shown else frames[0])[0]
    return RUN / 'frames' / name


(OUT / 'images').mkdir(parents=True, exist_ok=True)
for file, heading, lines, image, alt in DOCS:
    if image not in shots:
        raise SystemExit(f'no shot "{image}" in {RUN / "markers.json"} — record the whole demo first')
    marker = shots[image]
    picture = Image.open(frame_at(marker['t'])).convert('RGB')
    clip = marker.get('clip')
    if clip:
        # 기능이 보이는 부분만 — 앱 창 전체는 포스터에서 너무 작아진다
        k = picture.width / marker['view']['width']
        picture = picture.crop(tuple(round(v * k) for v in (clip['x'], clip['y'], clip['x'] + clip['width'], clip['y'] + clip['height'])))
    picture.thumbnail((WIDTH, WIDTH))
    picture.save(OUT / 'images' / f'{image}.png', optimize=True)
    body = [f'#### {heading}', '', *[f'- {line}' for line in lines], '', f'![{alt}](images/{image}.png)', '']
    (OUT / f'{file}.md').write_text('\n'.join(body), encoding='utf8')
    print(f'{file}.md  ← {image} at {marker["t"]:.1f}s {picture.size}')
