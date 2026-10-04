// Blink 데모 영상(v6) 실제 앱 녹화 — 소리 없음, 녹음은 나중에.
// 시연표(`Blink 데모 시나리오/v6/08-대본-중심-시연표.md`)의 문장마다 화면 조작을 하고, 문장 시작·끝을 기록한다.
// 개발 빌드(out/)를 Playwright로 띄우고 CDP 화면 캡처로 프레임을 받는다.
//
//   pnpm build
//   OPENAI_API_KEY=... node scripts/demo/record-demo.mjs
//
// 환경 변수
//   OPENAI_API_KEY          (필수) S05에서 API Key 칸에 입력한다. 화면에는 점(•)으로만 보이고, 출력·파일에 남기지 않는다
//   BLINK_DEMO_OUT          결과 폴더 (기본: 바탕 화면/blink-demo-v6)
//   BLINK_DEMO_FEATURES     기능 문서 5개 + images/ 폴더 (기본: 저장소 docs/features) — 보관함 맨 위 Features로 복사 (S10)
//   BLINK_DEMO_ONLY_UNTIL   이 장면까지만 녹화 (예: S07, 리허설용)
//
// 결과 (<OUT>/)
//   frames/*.jpg, frames.json        프레임과 시각
//   markers.json                     장면, 문장(line-start/line-end), AI 대기(wait-start/wait-end), 빠르게(fast-start/fast-end)
//   cursor.json                      커서 위치 [{t,x,y}] (CSS px, 화면 1440×810 기준) — 마우스 따라 확대에 쓴다
//   lines.json                       문장별 시작·끝 (녹화 시각) — 편집이 영상 시각으로 바꿔 .srt를 만든다
//   markers.json의 shot              기능 문서 스크린샷 순간 → python scripts/demo/feature-docs.py <OUT>
//   Blink_Phase1_Poster.pdf          S13에서 내보낸 포스터
// 녹화가 끝나면 키가 저장된 앱 데이터 폴더(<OUT>/user-data)를 지운다.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(import.meta.url), '../../..');
const require = createRequire(join(repo, 'package.json'));
const { _electron } = require('playwright-core');
const electronPath = require('electron');

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error('OPENAI_API_KEY is required (it is typed into the API Key field in S05)');
const OUT = resolve(process.env.BLINK_DEMO_OUT ?? join(process.env.USERPROFILE ?? '.', 'Desktop', 'blink-demo-v6'));
const FEATURES = resolve(process.env.BLINK_DEMO_FEATURES ?? join(repo, 'docs', 'features'));
if (!existsSync(FEATURES)) throw new Error(`Feature notes not found: ${FEATURES} (set BLINK_DEMO_FEATURES)`);
const ONLY_UNTIL = process.env.BLINK_DEMO_ONLY_UNTIL ?? null;

/** 녹화는 시연표의 ⏱보다 20% 넉넉하게 */
const SLACK = 1.2;
// 1440×810 CSS px × 화면 배율 → 프레임. 편집에서 1920×1080으로 맞춘다
const VIEW = { width: 1440, height: 810 };
const userData = join(OUT, 'user-data');
const vault = join(OUT, 'SE Class');
const framesDir = join(OUT, 'frames');
const pdfPath = join(OUT, 'Blink_Phase1_Poster.pdf');
for (const dir of [userData, vault, framesDir]) rmSync(dir, { recursive: true, force: true });
rmSync(pdfPath, { force: true });
for (const dir of [userData, framesDir]) mkdirSync(dir, { recursive: true });

// ── 보관함 "SE Class" (05-보관함-준비물.md) ─────────────────────────
const POSTER_TEMPLATE = [
  '# Project title',
  '',
  '**Team members | Department**',
  '',
  '### Description',
  '',
  '### 1. Key Features',
  '',
  '### 2. Tools & Architecture',
  '',
  '### 3. GenAI Development Tool',
  '',
  '### 4. Platform',
].join('\n');

// README Description을 대충 적은 한 덩어리 — Organize가 다듬어진 한 문장으로 바꾼다 (실제 AI 10번 중 10번)
const KICKOFF =
  'Blink = gets rid of the hassle of jumping between ai tools, copy pasting text & digging thru old notes... ' +
  'by putting everything in one seamless writing experience';

// README Tools & Architecture를 메모로 — 층 이름과 기술별 역할이 그대로 그림에 들어간다
// (openai-provider.live.test.ts의 README_ARCHITECTURE_MEMO와 같다. 실제 AI로 바로 시각화 10번 중 10번)
const ARCHITECTURE_MEMO =
  'ok architecture for the poster. ' +
  "the renderer process is react 19.3 for the user interface and tiptap 3.31 as the rich text editor. it can't touch files itself, " +
  'so it goes through preload / ipc to the main process. the main process is electron 44.4 for the desktop application ' +
  'and node.js 24 for the application logic and file i/o. ' +
  'main talks to the connected resources: sqlite 3.53 for the search and link index ' +
  'and openai sdk 7 for llm api communication.';

const INBOX = {
  'What is a container': 'A process isolated with its own filesystem, network and limits, sharing the host kernel.',
  'Container vs virtual machine': 'VMs virtualize hardware and carry a full OS; containers share the kernel, so they start in seconds.',
  'Dockerfile basics': 'FROM, COPY, RUN, CMD — each instruction adds an image layer.',
  'Image layers and caching': 'Unchanged layers are reused, so put rarely changing steps first.',
  'Kubernetes pods': 'The smallest deployable unit: one or more containers sharing a network and volumes.',
  'Deployments and ReplicaSets': 'Declare the desired number of replicas; Kubernetes keeps that many running.',
  'Kubernetes Services': 'A stable address and load balancing in front of pods that come and go.',
  'Horizontal Pod Autoscaler': 'Adds or removes pods based on CPU or custom metrics.',
  'Stateless vs stateful services': 'Stateless servers keep no session data, so any replica can serve any request.',
  'Externalizing session state': 'Move sessions to Redis or a database so pods can be replaced freely.',
  'Rolling updates': 'Replace pods a few at a time so the service never goes down.',
  'Blue-green deployment': 'Run the new version beside the old one, then switch traffic at once.',
  'Software development lifecycle': 'Requirements, design, implementation, testing, deployment, maintenance.',
  'Waterfall vs iterative models': 'One pass through every phase vs repeating short cycles with feedback.',
  'Pod lifecycle and probes': 'Pending, Running, Succeeded or Failed; liveness and readiness probes decide restarts and traffic.',
  'AI agents that fix GitHub issues': 'An agent reads the issue, explores the repo, edits code and opens a pull request.',
  'Issue to pull request workflow': 'Issue → branch → change → tests → PR → review → merge.',
  'Evaluating coding agents': "Benchmarks like SWE-bench check whether the agent's patch makes the issue's tests pass.",
  'Reviewing AI-written pull requests': 'Read the diff, run the tests, check the issue is really solved before merging.',
};

const files = {
  'Phase 1/Poster template.md': POSTER_TEMPLATE,
  'Phase 1/Kickoff meeting.md': KICKOFF,
  'Phase 1/Architecture memo.md': ARCHITECTURE_MEMO,
  // 포스터 제목 자리에 검색으로 가져올 워드마크 노트 (그림은 Features/images에서 파일 이름으로 찾는다)
  'Phase 1/Blink logo.md': '# ![Blink](blink-wordmark.svg)\n',
  'Phase 1/Scratch.md': 'test',
  ...Object.fromEntries(Object.entries(INBOX).map(([title, body]) => [`Inbox/${title}.md`, body])),
};
for (const [path, body] of Object.entries(files)) {
  const file = join(vault, ...path.split('/'));
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, body);
}
// 보관함 맨 위에 둔다: Phase 1에 하위 폴더가 있으면 S06에서 새 노트 제목을 정할 때 자동 배치가 노트를 옮긴다
cpSync(FEATURES, join(vault, 'Features'), { recursive: true });
// 포스터 제목 자리에 넣을 Blink 워드마크 (앱의 그림 그대로). Blink logo 노트가 `![Blink](blink-wordmark.svg)`로 가리킨다 — 보관함에서 파일 이름으로 찾는다
cpSync(join(repo, 'src', 'renderer', 'assets', 'blink-wordmark.svg'), join(vault, 'Features', 'images', 'blink-wordmark.svg'));

// 처음 실행처럼: 보관함 선택 화면, AI 설정 없음
writeFileSync(join(userData, 'app-config.json'), JSON.stringify({ lastVault: null, recentVaults: [] }));

const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'OPENAI_API_KEY'));
delete env.ELECTRON_RENDERER_URL;
delete env.ELECTRON_RUN_AS_NODE;
// 운영체제 창(폴더 선택·PDF 저장)을 띄우지 않고 정한 경로를 쓴다 (개발 빌드 전용 훅)
Object.assign(env, { BLINK_E2E_VAULT_CHOICE: vault, BLINK_E2E_PDF_PATH: pdfPath });

const app = await _electron.launch({ executablePath: electronPath, args: [repo, `--user-data-dir=${userData}`], cwd: repo, env });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 0, mobile: false });

// 화면에 보이는 커서와 클릭 표시 (캡처에는 OS 커서가 찍히지 않는다)
const installCursor = () =>
  page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#10213D" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-3px,-2px)' });
    document.body.append(cursor);
    const style = document.createElement('style');
    style.textContent =
      '@keyframes demo-ripple{from{transform:translate(-50%,-50%) scale(.3);opacity:.7}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}' +
      '.demo-ripple{position:fixed;width:34px;height:34px;border-radius:50%;background:rgba(80,221,203,.45);pointer-events:none;z-index:2147483646;animation:demo-ripple .5s ease-out forwards}';
    document.head.append(style);
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener('mousedown', (e) => {
      const ripple = document.createElement('div');
      ripple.className = 'demo-ripple';
      Object.assign(ripple.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      document.body.append(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);
  });
await installCursor();

// ── 기록 ───────────────────────────────────────────────────────
const frames = [];
let frameNo = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const name = `${String(frameNo++).padStart(6, '0')}.jpg`;
  writeFileSync(join(framesDir, name), Buffer.from(data, 'base64'));
  frames.push({ name, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
const now = () => Date.now() / 1000 - t0;
const markers = [];
const cursorLog = [];
const lines = [];
const mark = (type, extra = {}) => markers.push({ type, t: now(), ...extra });
/** 글을 선택하면 뜨는 AI 도구 막대(Expand·Organize·Visualize)를 보여 주고 누른다. 편집은 그동안 막대를 확대한다 */
async function useAiToolbar(name) {
  const toolbar = page.getByRole('toolbar', { name: 'AI actions' });
  await toolbar.waitFor();
  const box = await toolbar.boundingBox();
  mark('focus-start', { name: 'ai-toolbar', rect: box });
  await pause(700); // 세 버튼을 보여 준다
  await click(aiButton(name));
  await pulse().waitFor();
  mark('focus-end', { name: 'ai-toolbar' });
}

/** 선택한 글과 그 위 AI 도구 막대를 함께 담는 영역 (CSS px) */
async function selectionWithToolbar() {
  const toolbar = await page.getByRole('toolbar', { name: 'AI actions' }).boundingBox();
  const selection = await page.evaluate(() => {
    const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  });
  const boxes = [toolbar, selection].filter(Boolean);
  const x = Math.min(...boxes.map((b) => b.x)) - 24;
  const y = Math.min(...boxes.map((b) => b.y)) - 4; // 막대 바로 위에서 — 윗줄 글이 반쯤 걸리지 않게
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + 24;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 16;
  return { x, y, width: right - x, height: bottom - y };
}

/** 기능 문서 스크린샷으로 쓸 순간 (feature-docs.py가 이 시각의 프레임을 쓴다) */
const shot = async (name, region, { belowChrome = false } = {}) => {
  // region: 잘라 낼 영역 (locator 또는 {x,y,width,height}, CSS px). 화면 밖은 잘라 낸다
  // belowChrome: 편집기 머리줄(위치·서식 도구막대) 아래만 — 스크롤한 본문이 그 뒤에 가려 있다
  const box = region && typeof region.boundingBox === 'function' ? await region.boundingBox() : region;
  const chrome = belowChrome ? await page.getByRole('toolbar', { name: 'Formatting' }).boundingBox() : null;
  const top = chrome ? chrome.y + chrome.height + 4 : 0;
  const clip = box
    ? (() => {
        const x = Math.max(0, box.x - 12);
        const y = Math.max(top, box.y - 12);
        return { x, y, width: Math.min(VIEW.width, box.x + box.width + 12) - x, height: Math.min(VIEW.height, box.y + box.height + 12) - y };
      })()
    : null;
  mark('shot', { name, clip, view: VIEW });
};
const pause = (ms) => page.waitForTimeout(ms);

class StopRecording extends Error {}

/** 장면 하나. ONLY_UNTIL을 지나면 멈춘다 */
async function scene(id, title, run) {
  mark('scene', { id, title });
  console.log(`${id} ${title}`);
  await run();
  if (ONLY_UNTIL && id === ONLY_UNTIL) throw new StopRecording();
}

/**
 * 시연표의 문장 하나. 조작을 하고, 걸린 시간이 ⏱×1.2보다 짧으면 남은 시간만큼 결과 화면을 둔다.
 * AI 대기(waitAI)·빠르게(fast) 구간은 편집에서 줄이므로 문장 길이에 넣지 않는다.
 */
async function line(id, seconds, run = async () => {}) {
  const start = now();
  let skipped = 0;
  const skip = (s) => (skipped += s);
  mark('line-start', { id });
  await run(skip);
  const target = seconds * SLACK;
  const spent = now() - start - skipped;
  if (spent < target) await pause((target - spent) * 1000);
  mark('line-end', { id });
  lines.push({ id, start, end: now(), target, spent: Math.round(spent * 100) / 100 });
  if (spent > target + 1) console.log(`  ${id}: ${spent.toFixed(1)}s (target ${target.toFixed(1)}s)`);
}

/** 이 구간은 편집에서 factor배로 빠르게. 걸린 시간은 문장 길이에서 뺀다 (빨라진 뒤의 길이만 센다) */
async function fast(factor, skip, run) {
  const start = now();
  mark('fast-start', { factor });
  await run();
  mark('fast-end', { factor });
  const spent = now() - start;
  skip(spent - spent / factor);
}

/** AI가 끝날 때까지. 대기 구간은 편집에서 줄이고 문장 길이에 넣지 않는다 */
async function waitAI(skip, done, { timeout = 180_000, showMs = 1600 } = {}) {
  await pause(showMs); // 깜빡임(Pulse)을 보여 줄 만큼
  const start = now();
  mark('wait-start');
  await done({ timeout });
  mark('wait-end');
  skip(now() - start);
}

// ── 사람처럼 움직이는 마우스 (위치를 기록한다) ───────────────────────
let pos = { x: VIEW.width / 2, y: VIEW.height / 2 };
async function moveTo(x, y, { speed = 14 } = {}) {
  const steps = Math.max(8, Math.round(Math.hypot(x - pos.x, y - pos.y) / speed));
  const from = pos;
  for (let i = 1; i <= steps; i++) {
    // 부드럽게 출발·도착 (ease-in-out)
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const p = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(p.x, p.y);
    cursorLog.push({ t: Math.round(now() * 1000) / 1000, x: Math.round(p.x), y: Math.round(p.y) });
  }
  pos = { x, y };
}
const logCursor = () => cursorLog.push({ t: Math.round(now() * 1000) / 1000, x: Math.round(pos.x), y: Math.round(pos.y) });

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`not visible: ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function hover(locator, ms = 180) {
  const c = await centerOf(locator);
  await moveTo(c.x, c.y);
  await pause(ms);
}
async function press(button = 'left') {
  await page.mouse.down({ button });
  await pause(70);
  await page.mouse.up({ button });
  logCursor();
}
async function click(locator, { after = 350, button = 'left' } = {}) {
  await hover(locator);
  await press(button);
  await pause(after);
}
const type = (text, delay = 38) => page.keyboard.type(text, { delay });
async function key(combo, after = 250) {
  await page.keyboard.press(combo);
  await pause(after);
}

// ── 편집기 도우미 ─────────────────────────────────────────────────
const BODY = '[aria-label="Note body"]:not([aria-readonly])';

/** 본문에서 text가 끝나는(atEnd) 또는 시작하는 곳의 화면 좌표. 화면 밖이면 먼저 보이게 한다 */
async function textPoint(text, atEnd) {
  return page.evaluate(
    ({ t, end, sel }) => {
      const root = document.querySelector(sel);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.textContent.indexOf(t);
        if (i < 0) continue;
        node.parentElement.scrollIntoView({ block: 'center' });
        const range = document.createRange();
        const at = end ? i + t.length - 1 : i;
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const r = [...range.getClientRects()].pop();
        return end ? { x: r.right + 1, y: r.top + r.height / 2 } : { x: r.left + 1, y: r.top + r.height / 2 };
      }
      return null;
    },
    { t: text, end: atEnd, sel: BODY },
  );
}

/** 편집기 문서에서 text의 위치 (ProseMirror pos) */
async function docRange(startText, endText = startText) {
  return page.evaluate(
    ({ a, b, sel }) => {
      const { state } = document.querySelector(sel).editor;
      let from = -1;
      let to = -1;
      state.doc.descendants((node, p) => {
        if (!node.isText) return;
        const i = node.text.indexOf(a);
        if (from < 0 && i >= 0) from = p + i;
        const j = node.text.indexOf(b);
        if (j >= 0 && (from >= 0 || i >= 0)) to = p + j + b.length;
      });
      return { from, to };
    },
    { a: startText, b: endText, sel: BODY },
  );
}

/** 본문에서 text 끝을 눌러 커서를 둔다. 잡히지 않으면 편집기에 직접 지정한다 */
async function clickAfter(text) {
  const point = await textPoint(text, true);
  if (!point) throw new Error(`text not found: ${text}`);
  await moveTo(point.x, point.y);
  await press();
  await pause(200);
  const { to } = await docRange(text);
  await page.evaluate(
    ({ end, sel }) => {
      const { editor } = document.querySelector(sel);
      if (editor.state.selection.from !== end) editor.chain().focus().setTextSelection(end).run();
    },
    { end: to, sel: BODY },
  );
}

/** text 끝을 누르고 Enter — 그 아래 새 줄에서 쓴다 */
async function newLineAfter(text) {
  await clickAfter(text);
  await key('End', 100);
  await key('Enter', 300);
}

/** startText 처음부터 endText 끝까지 마우스로 끌어 선택한다. 끌기가 어긋나면 같은 범위를 편집기에 지정한다 */
async function dragSelect(startText, endText = startText) {
  const a = await textPoint(startText, false);
  const b = await textPoint(endText, true);
  if (!a || !b) throw new Error(`text not found: ${startText} … ${endText}`);
  await moveTo(a.x, a.y);
  await page.mouse.down();
  await pause(80);
  await moveTo(b.x, b.y, { speed: 9 });
  await page.mouse.up();
  await pause(300);
  const { from, to } = await docRange(startText, endText);
  await page.evaluate(
    ({ from, to, sel }) => {
      const { editor } = document.querySelector(sel);
      const s = editor.state.selection;
      if (s.from !== from || s.to !== to) editor.chain().focus().setTextSelection({ from, to }).run();
    },
    { from, to, sel: BODY },
  );
  await pause(450);
}

/** 화면 가운데로 부드럽게 스크롤 */
async function scrollToText(text) {
  await page.evaluate(
    ({ t, sel }) => {
      const root = document.querySelector(sel);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent.includes(t)) return node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    { t: text, sel: BODY },
  );
  await pause(700);
}

const tree = page.getByRole('region', { name: 'Note list' });
const aiButton = (name) => page.getByRole('toolbar', { name: 'AI actions' }).getByRole('button', { name });
const pulse = () => page.locator('.ai-processing').first();
const toast = (text) => page.getByText(text, { exact: true });

async function expandFolder(name) {
  const item = tree.getByRole('treeitem', { name, exact: true });
  if ((await item.getAttribute('aria-expanded')) !== 'true') await click(tree.getByRole('button', { name, exact: true }), { after: 500 });
}

/** 트리에서 노트를 연다. 정리·자동 배치로 위치가 바뀌었을 수 있어 디스크에서 찾아 접힌 폴더를 펼친다 */
async function openNote(name) {
  const find = (dir, rel = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === `${name}.md`) return rel;
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const hit = find(join(dir, entry.name), [...rel, entry.name]);
        if (hit) return hit;
      }
    }
    return null;
  };
  const folders = find(vault);
  if (!folders) throw new Error(`note not found on disk: ${name}`);
  for (const folder of folders) await expandFolder(folder);
  await click(tree.getByRole('link', { name, exact: true }), { after: 600 });
}

/** Ctrl K → 검색 → 결과의 버튼(Preview·Link·Import·Open) */
const palette = page.getByRole('dialog', { name: 'Search notes' });
async function search(query) {
  await key('Control+k', 300);
  await palette.getByRole('searchbox', { name: 'Search query' }).waitFor();
  await type(query, 70);
  await pause(500);
}
const hit = (title) => palette.getByRole('article', { name: title });
async function searchAndImport(query, title) {
  await search(query);
  await hit(title).waitFor();
  await pause(300);
  await click(hit(title).getByRole('button', { name: 'Import' }), { after: 600 });
}

// ── 시연 (S04–S13). S01–S03은 편집에서 카드·애니메이션 ───────────────────
const body = page.locator(BODY);
const scrollRoot = (top) => page.evaluate((y) => document.querySelector('[data-scroll-root]')?.scrollTo({ top: y, behavior: 'smooth' }), top);

try {
  await pause(1000);

  await scene('S04', 'Open the workspace', async () => {
    const openFolder = page.getByRole('button', { name: 'Open folder' });
    await openFolder.waitFor();
    await line('S04-1', 2, async () => {
      await hover(openFolder, 900); // 폴더 그림이 열리며 종이가 솟는다
      await press();
      await tree.waitFor();
      await installCursor(); // 화면이 바뀌어도 커서가 남아 있게
    });
    await line('S04-2', 2.5);
  });

  await scene('S05', 'AI settings', async () => {
    const settings = page.getByRole('dialog', { name: 'AI settings' });
    await line('S05-1', 2, async () => {
      await click(page.getByRole('link', { name: 'Settings' }));
      await settings.waitFor();
    });
    await line('S05-2', 4.5, async () => {
      const form = settings.getByRole('form', { name: 'AI settings' });
      const provider = form.getByRole('combobox', { name: 'Provider' });
      await hover(provider, 300); // 목록에 OpenAI·Kimi
      await provider.selectOption('openai');
      await pause(400);
      const keyField = form.getByLabel('API Key');
      await click(keyField, { after: 150 });
      // 비밀번호 칸 — 점으로만 보인다. 몇 글자 치는 모습만 보이고 나머지는 한 번에 채운다
      await page.keyboard.type(KEY.slice(0, 8), { delay: 40 });
      await keyField.fill(KEY);
      await pause(300);
      const model = form.getByRole('combobox', { name: 'Model' });
      await hover(model, 300);
      await model.selectOption('gpt-5.4-mini');
      await pause(400);
      await click(form.getByRole('button', { name: 'Save' }));
      await toast('AI settings saved').waitFor();
      await pause(500);
      await click(settings.getByRole('button', { name: 'Close' }));
      await settings.waitFor({ state: 'detached' });
    });
  });

  await scene('S06', 'Basic notes and the poster note', async () => {
    await line('S06-1', 1.5, async () => {
      await expandFolder('Phase 1');
    });
    await line('S06-2', 4.5, async () => {
      // S06-1에서 펼치며 고른 Phase 1에 새 노트가 생긴다. Phase 1에는 하위 폴더가 없어 자동 배치가 옮기지 않는다
      await click(page.getByRole('button', { name: 'New note' }).first(), { after: 600 });
      const title = page.getByRole('textbox', { name: 'Note title' });
      await title.waitFor();
      await click(title, { after: 150 });
      await key('Control+a', 100);
      await type('Phase 1 Poster', 60);
      await key('Enter', 600);
    });
    await line('S06-3', 5, async (skip) => {
      await fast(2.5, skip, async () => {
        await click(body, { after: 200 });
        await searchAndImport('template', 'Poster template');
        await body.getByText('Project title').waitFor();
        // 제목 자리는 비우고, 워드마크도 검색으로 가져온다 (Blink logo 노트)
        await dragSelect('Project title');
        await key('Backspace', 200);
        await searchAndImport('logo', 'Blink logo');
        await body.locator('h1 img[alt="Blink"]').waitFor();
        await key('Backspace', 200); // 가져온 뒤 생긴 빈 줄은 지운다
        await dragSelect('Team members | Department');
        await type('Jeong-O Heo · Seokjun Park | Department of Information Systems', 18);
        await page.getByText('Saved', { exact: true }).waitFor();
        await pause(400);
      });
      await fast(1.5, skip, async () => {
        await click(tree.getByRole('link', { name: 'Scratch', exact: true }), { after: 400 });
        await click(page.getByRole('button', { name: 'Delete note' }), { after: 250 });
        await click(page.getByRole('dialog', { name: 'Delete this note?' }).getByRole('button', { name: 'Delete' }), { after: 500 });
        await openNote('Phase 1 Poster');
      });
    });
  });

  await scene('S07', 'AI folder organization', async () => {
    const dialog = page.getByRole('dialog', { name: 'Organize — Inbox' });
    const preview = dialog.getByRole('list', { name: 'Organize preview' });
    await line('S07-1', 3, async () => {
      await expandFolder('Inbox');
      await moveTo(170, 430);
    });
    await line('S07-2', 4, async (skip) => {
      await click(tree.getByRole('button', { name: 'Inbox', exact: true }), { button: 'right', after: 600 });
      await click(page.getByRole('menuitem', { name: 'Organize' }));
      await dialog.waitFor();
      await waitAI(skip, (o) => preview.waitFor(o), { showMs: 900 });
      await pause(400);
      // 포스터 사진: 미리보기 위쪽(폴더 두세 개)만 — 목록 전체는 세로로 길어 포스터 글이 좁아진다
      const organizeBox = await dialog.boundingBox();
      await shot('05-organize', { ...organizeBox, height: Math.min(organizeBox.height, 330) });
    });
    await line('S07-3', 5, async () => {
      const box = await preview.boundingBox();
      await moveTo(box.x + 60, box.y + 20);
      await moveTo(box.x + 60, box.y + Math.min(box.height - 20, 260), { speed: 4 }); // 천천히 훑는다
      await click(dialog.getByRole('button', { name: 'Move' }));
      await dialog.waitFor({ state: 'detached', timeout: 60_000 });
      await pause(600);
      // 새 폴더 몇 개를 펼쳐 결과를 보여 준다
      for (let i = 0; i < 3; i++) {
        const closed = tree.locator('[role="treeitem"][aria-expanded="false"][aria-level="2"]');
        if ((await closed.count()) === 0) break;
        const name = await closed.first().getAttribute('aria-label');
        await click(closed.first().getByRole('button', { name, exact: true }), { after: 350 });
      }
    });
  });

  await scene('S08', 'Expand — studying Agile', async () => {
    const sentence = "Agile? I think it's about building in short cycles and changing the plan after feedback.";
    await line('S08-1', 2.5, async () => {
      await openNote('Waterfall vs iterative models');
    });
    await line('S08-2', 5, async (skip) => {
      await newLineAfter('cycles with feedback.');
      await fast(3, skip, () => type(sentence, 12));
      await pause(300);
      await dragSelect(sentence);
      await useAiToolbar('Expand');
    });
    await line('S08-3', 4, async (skip) => {
      await waitAI(skip, (o) => pulse().waitFor({ state: 'detached', ...o }), { showMs: 300 });
      await pause(800);
      await scrollToText('Sources');
      await hover(body.getByText('Sources', { exact: true }), 300);
      const source = body.locator('a[href^="http"]').first();
      if (await source.count()) await hover(source, 700);
    });
  });

  await scene('S09', 'Organize — Description', async () => {
    const first = 'Blink = gets rid of';
    const last = 'one seamless writing experience';
    await line('S09-1', 3, async () => {
      await openNote('Phase 1 Poster');
      await newLineAfter('Description');
    });
    await line('S09-2', 3.5, async () => {
      await searchAndImport('kickoff', 'Kickoff meeting');
      await body.getByText(first, { exact: false }).waitFor();
      await pause(800); // 지저분한 메모를 보여 준다
    });
    await line('S09-3', 5, async () => {
      await dragSelect(first, last);
      await shot('02-writing', await selectionWithToolbar()); // 포스터 사진: 선택한 글 위의 AI 도구 막대
      await useAiToolbar('Organize');
      await pause(900);
      // 깜빡이는 동안 다른 곳에서 계속 쓴다 — 쓴 줄은 지워 원래대로
      await newLineAfter('1. Key Features');
      await type('draft', 90);
      await pause(500);
      for (let i = 0; i < 6; i++) await key('Backspace', 70);
    });
    await line('S09-4', 4, async (skip) => {
      await waitAI(skip, (o) => pulse().waitFor({ state: 'detached', ...o }), { showMs: 0 });
      await scrollToText('Description');
      const box = await body.getByText('Description').boundingBox();
      await moveTo(box.x + 140, box.y + box.height + 30); // 바뀐 설명을 가리킨다
      await pause(500);
    });
  });

  await scene('S10', 'Search & reuse — Key Features', async () => {
    await line('S10-1', 4, async () => {
      await newLineAfter('1. Key Features');
      await expandFolder('Features');
      await hover(tree.getByRole('link', { name: '05 AI Folder Organization', exact: true }), 600);
    });
    await line('S10-2', 6, async () => {
      await search('note management');
      const first = hit('01 Basic Note Management');
      await first.waitFor();
      await click(first.getByRole('button', { name: 'Preview' }), { after: 1400 });
      await shot('04-search', palette);
      await click(first.getByRole('button', { name: 'Link' }), { after: 800 });
    });
    await line('S10-3', 5, async (skip) => {
      // 링크는 보여 줬으니 지운다 — 포스터에는 가져온 설명만 남긴다
      await fast(1.5, skip, async () => {
        await key('Shift+Home', 200);
        await key('Backspace', 300);
      });
      await fast(1.5, skip, () => searchAndImport('note management', '01 Basic Note Management'));
      await fast(3, skip, async () => {
        for (const [query, title] of [
          ['writing assistance', '02 AI Writing Assistance'],
          ['visualization', '03 AI Visualization'],
          ['search reuse', '04 Note Search & Reuse'],
          ['folder organization', '05 AI Folder Organization'],
        ]) {
          await searchAndImport(query, title);
        }
      });
      await scrollToText('01. Basic Note Management');
      const center = { x: VIEW.width * 0.55, y: VIEW.height * 0.55 };
      await moveTo(center.x, center.y);
      await fast(1.5, skip, async () => {
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 300);
          await pause(300);
        }
      });
    });
  });

  await scene('S11', 'Visualize — architecture', async () => {
    const first = 'ok architecture for the poster';
    const last = 'for llm api communication.';
    const figure = body.getByRole('figure').first();
    await line('S11-1', 1.5, async () => {
      await newLineAfter('2. Tools & Architecture');
    });
    await line('S11-2', 6, async (skip) => {
      await fast(1.5, skip, async () => {
        await searchAndImport('preload', 'Architecture memo');
        await body.getByText(first, { exact: false }).waitFor();
      });
      await dragSelect(first, last);
      await useAiToolbar('Visualize');
      await waitAI(skip, async (o) => {
        await pulse().waitFor({ state: 'detached', ...o });
        await figure.locator('[data-card]').first().waitFor(o); // ELK 배치까지
      });
    });
    await line('S11-3', 2, async () => {
      await figure.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await pause(500);
      await hover(figure.locator('[data-group]').first(), 400);
    });
    await line('S11-4', 2.5, async () => {
      const card = figure.locator('[data-card]').last(); // 맨 아래 층 둘째 줄 (OpenAI SDK 7)
      const c = await centerOf(card);
      await moveTo(c.x, c.y);
      await page.mouse.down();
      await pause(120);
      await moveTo(c.x + 70, c.y + 40, { speed: 4 });
      await pause(350);
      // 연결선이 따라오는 걸 보여 준 뒤 제자리로 — 포스터 그림은 원래 배치 그대로
      await moveTo(c.x, c.y, { speed: 5 });
      await page.mouse.up();
      logCursor();
      await pause(400);
    });
    await line('S11-5', 2, async () => {
      await hover(figure.getByRole('button', { name: 'Save as PNG' }), 700); // 누르지 않는다
    });
  });

  await scene('S12', 'Tools, GenAI tool & platform', async () => {
    const figure = body.getByRole('figure').first();
    await line('S12-1', 7, async (skip) => {
      // 그림이 생겼으니 메모 원문은 지운다 — 포스터에는 그림만 남긴다
      await fast(2, skip, async () => {
        await dragSelect('ok architecture for the poster', 'for llm api communication.');
        await key('Backspace', 200);
        await key('Backspace', 300); // 남은 빈 줄도 — 그림이 섹션 제목 바로 아래에 오게
      });
      // 대사가 기술을 말하는 동안 층을 위에서 아래로 짚는다 (역할·로고가 보이게)
      await figure.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await pause(600);
      for (const group of await figure.locator('[data-group]').all()) {
        const box = await group.boundingBox();
        if (!box) continue;
        await moveTo(box.x + box.width * 0.3, box.y + box.height / 2, { speed: 10 });
        await moveTo(box.x + box.width * 0.7, box.y + box.height / 2, { speed: 6 });
      }
    });
    await line('S12-2', 2.5, async (skip) => {
      await fast(2, skip, async () => {
        await newLineAfter('3. GenAI Development Tool');
        await type('- Claude Code (Claude Opus 5.5)', 14);
        await newLineAfter('4. Platform');
        await type('- Desktop Application (Electron)', 14);
        await key('Enter', 100);
        await type('Windows 11', 14);
      });
      await hover(body.getByText('Windows 11', { exact: true }), 400);
    });
  });

  await scene('S13', 'PDF export & closing', async () => {
    await line('S13-1', 4.5, async (skip) => {
      await scrollRoot(0);
      await pause(300);
      await click(page.getByRole('button', { name: 'Export PDF' }));
      const dialog = page.getByRole('dialog', { name: 'Export PDF' });
      const summary = dialog.getByText(/^\d+ pages? · /);
      // 미리보기를 재는 동안(Laying out…)은 대기 구간 — 편집에서 줄인다
      await waitAI(skip, (o) => summary.waitFor(o), { showMs: 200, timeout: 60_000 });
      // 포스터는 길다 — 논문처럼 두 단으로 넣으면 글자가 커진다
      await click(dialog.getByRole('radio', { name: '2' }), { after: 200 });
      await waitAI(skip, (o) => dialog.getByText('Laying out…').waitFor({ state: 'detached', ...o }), { showMs: 0, timeout: 60_000 });
      await hover(summary, 700);
      await click(dialog.getByRole('button', { name: 'Export', exact: true }), { after: 0 });
      // PDF를 만드는 동안도 대기 구간
      await waitAI(skip, (o) => toast('Saved as PDF').waitFor(o), { showMs: 300, timeout: 60_000 });
      await pause(600);
    });
    // S13-2·3은 편집에서 저장된 PDF 화면 (🎬)
    await line('S13-2', 2);
    await line('S13-3', 2.5);
  });
  mark('scene', { id: 'end', title: 'end' });
  await pause(500);
} catch (error) {
  if (!(error instanceof StopRecording)) {
    await page.screenshot({ path: join(OUT, 'failure.png') }).catch(() => {});
    throw error;
  }
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {});
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ t0, frames }));
  writeFileSync(join(OUT, 'markers.json'), JSON.stringify(markers, null, 2));
  writeFileSync(join(OUT, 'cursor.json'), JSON.stringify({ view: VIEW, points: cursorLog }));
  writeFileSync(join(OUT, 'lines.json'), JSON.stringify(lines, null, 2));
  await app.close().catch(() => {});
  // 키가 저장된 앱 데이터는 남기지 않는다
  rmSync(userData, { recursive: true, force: true });
  console.log(`frames=${frames.length} lines=${lines.length} pdf=${existsSync(pdfPath)}`);
}
