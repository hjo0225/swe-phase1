// 데모 영상(v6)의 카드와 S02 애니메이션을 1920x1080 PNG로 그린다 (Electron 화면 밖 렌더링).
//   node_modules/electron/dist/electron.exe scripts/demo/render-cards.cjs <결과 폴더>/edit/cards
// 결과: s01.png (인트로), s03.png (빈 포스터 양식), bg.png (S13 PDF 화면 배경), s02/0000.png… (9초 × 30fps)
// edit-v6.py가 카드가 없으면 이 스크립트를 부른다.
const { app, BrowserWindow } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const OUT = process.argv.at(-1);
const FPS = 30;
const S02_SECONDS = 9;
const wordmark = readFileSync(join(__dirname, '../../src/renderer/assets/blink-wordmark.svg'));
const logo = `data:image/svg+xml;base64,${wordmark.toString('base64')}`;
const CURSOR =
  '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#10213D" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const page = (body, css = '', script = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  body {
    position: relative;
    font-family: 'Segoe UI Variable Display', 'Segoe UI', sans-serif;
    color: #10213d;
    background:
      radial-gradient(1100px 700px at 12% 8%, #c9e2ff 0%, transparent 70%),
      radial-gradient(900px 640px at 92% 96%, #a9f1e7 0%, transparent 70%),
      linear-gradient(160deg, #e5f1ff 0%, #f3f8ff 55%, #edfffc 100%);
  }
  .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; }
  .glass {
    border-radius: 40px;
    background: rgba(255,255,255,0.55); border: 1.5px solid rgba(255,255,255,0.8);
    box-shadow: 0 30px 80px rgba(47,109,219,0.12);
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  ${css}
</style></head><body>${body}<script>${script}</script></body></html>`;

// ── S01 인트로: 아래 대본 자막(2줄)과 겹치지 않게 카드를 위로 올린다 ─────────────
const s01 = page(
  `<div class="center" style="justify-content:center;padding-bottom:190px">
    <div class="glass intro">
      <div class="kicker">Software Engineering I — Phase 1</div>
      <div class="title">AI Note Organizer</div>
      <img class="logo" src="${logo}">
      <div class="team">Jeong-O Heo · Seokjun Park <span>|</span> Department of Information Systems</div>
    </div></div>`,
  `.intro { padding: 60px 120px 56px; }
   .kicker { font-size: 30px; font-weight: 600; letter-spacing: 3px; color: #2f6ddb; }
   .title { margin-top: 14px; font-size: 92px; font-weight: 700; letter-spacing: -1.5px; }
   .logo { margin-top: 18px; width: 360px; }
   .team { margin-top: 22px; font-size: 30px; color: #40536e; font-style: italic; }
   .team span { margin: 0 14px; color: #9fb0c8; font-style: normal; }`,
);

// ── S03 빈 포스터 양식: 종이 한 장, 칸은 비어 있다 ─────────────────────────────
const box = (h) => `<div class="blank" style="height:${h}px"></div>`;
const s03 = page(
  `<div class="center">
    <div class="today">Today: our Phase 1 poster, made with Blink</div>
    <div class="paper">
      <div class="ptitle">Project title</div>
      <div class="pteam">Team | Department</div>
      <div class="rule"></div>
      <div class="h">Description</div>${box(46)}
      <div class="h">1. Key Features</div>${box(160)}
      <div class="h">2. Tools &amp; Architecture</div>${box(140)}
      <div class="h">3. GenAI Development Tool</div>${box(26)}
      <div class="h">4. Platform</div>${box(26)}
    </div></div>`,
  `.today { margin-top: 44px; font-size: 30px; font-style: italic; color: #40536e; }
   .paper { margin-top: 22px; width: 560px; height: 792px; background: #fff; border-radius: 4px; padding: 44px 46px;
     box-shadow: 0 2px 6px rgba(16,33,61,0.08), 0 28px 70px rgba(16,33,61,0.18); }
   .ptitle { font-size: 38px; font-weight: 700; color: #b7c3d6; }
   .pteam { margin-top: 6px; font-size: 18px; font-weight: 600; color: #b7c3d6; }
   .rule { margin: 18px 0 6px; height: 2px; background: linear-gradient(90deg, #4281e7, #28c8b8); opacity: .55; }
   .h { margin-top: 16px; font-size: 19px; font-weight: 700; color: #2b3d5a; }
   .blank { margin-top: 8px; border: 2px dashed #d6dfec; border-radius: 8px; }`,
);

const bg = page('');

// ── S02 개발 배경: 일반 "Document"·"AI Chat" 창을 오가는 9초 애니메이션 ────────────
// setTime(t)가 t초의 화면을 그대로 만든다 → 프레임마다 불러 캡처한다 (시간에 따라 결정적)
const SENTENCE = 'It should help students keep their notes in order.';
const ANSWER = 'It helps students sort, connect, and reuse their class notes.';
const bar = (title) => `<div class="bar"><i></i><i></i><i></i><span>${title}</span></div>`;
const s02 = page(
  `<div id="flow"><div class="flabel">train of thought</div><svg id="fsvg" width="1000" height="70" viewBox="0 -35 1000 70"></svg></div>
   <div class="win" id="doc">${bar('Document')}
     <div class="docpage">
       <h2>Project notes</h2>
       <p>We are building a desktop app for class notes.</p>
       <p><span id="typed" class="sel"></span><span id="caret"></span></p>
       <p id="pasted">${ANSWER}</p>
     </div></div>
   <div class="win" id="chat">${bar('AI Chat')}
     <div class="msgs">
       <div class="bubble user" id="ubub">${SENTENCE}</div>
       <div class="bubble ai" id="abub"><span id="dots"><b></b><b></b><b></b></span><span id="answer">Try this: <span id="quote" class="sel">“${ANSWER}”</span></span></div>
     </div>
     <div class="input"><span id="itext"></span><span id="send">Send</span></div></div>
   <div id="pill"></div><div id="ripple"></div><div id="cursor">${CURSOR}</div>`,
  `#flow { position: absolute; left: 0; right: 0; top: 52px; display: flex; align-items: center; justify-content: center; gap: 26px; }
   .flabel { font-size: 22px; font-weight: 600; letter-spacing: 2px; color: #6b7f9e; text-transform: uppercase; }
   .win { position: absolute; left: 400px; top: 168px; width: 1120px; height: 620px; border-radius: 24px; overflow: hidden;
     background: rgba(255,255,255,0.94); border: 1.5px solid rgba(255,255,255,0.9); box-shadow: 0 30px 80px rgba(47,109,219,0.18); }
   .bar { height: 56px; border-bottom: 1.5px solid #e6eefb; display: flex; align-items: center; padding: 0 22px; gap: 9px; position: relative; }
   .bar i { width: 13px; height: 13px; border-radius: 50%; background: #d5deeb; }
   .bar span { position: absolute; left: 0; right: 0; text-align: center; font-size: 21px; font-weight: 600; color: #40536e; }
   .docpage { padding: 44px 72px; }
   .docpage h2 { font-size: 38px; font-weight: 700; margin-bottom: 22px; }
   .docpage p { font-size: 28px; line-height: 1.55; color: #2b3d5a; min-height: 44px; margin-bottom: 10px; }
   #pasted { border-radius: 8px; padding: 2px 8px; margin-left: -8px; }
   #caret { display: inline-block; width: 2.5px; height: 32px; background: #2f6ddb; vertical-align: -6px; margin-left: 2px; }
   .sel { border-radius: 4px; }
   .msgs { padding: 34px 48px; display: flex; flex-direction: column; gap: 22px; }
   .bubble { max-width: 860px; font-size: 26px; line-height: 1.45; padding: 16px 22px; }
   .user { align-self: flex-end; background: #4281e7; color: #fff; border-radius: 20px 20px 6px 20px; }
   .ai { align-self: flex-start; background: #eef3fa; color: #10213d; border-radius: 20px 20px 20px 6px; }
   #dots { display: inline-flex; gap: 9px; padding: 8px 4px; }
   #dots b { width: 13px; height: 13px; border-radius: 50%; background: #7d90ad; }
   .input { position: absolute; left: 48px; right: 48px; bottom: 30px; height: 70px; border: 2px solid #d9e3f2; border-radius: 18px;
     display: flex; align-items: center; padding: 0 12px 0 24px; font-size: 24px; color: #2b3d5a; background: #fff; }
   #itext { flex: 1; white-space: nowrap; overflow: hidden; }
   #itext.ph { color: #9fb0c8; }
   #send { background: #2f6ddb; color: #fff; font-weight: 600; font-size: 22px; padding: 10px 26px; border-radius: 12px; }
   #pill { position: absolute; padding: 9px 22px; border-radius: 12px; background: #10213d; color: #fff; font-size: 22px; font-weight: 600;
     box-shadow: 0 10px 26px rgba(16,33,61,0.25); transform: translate(-50%, -100%); white-space: nowrap; }
   #ripple { position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(80,221,203,.5); }
   #cursor { position: absolute; transform: translate(-4px,-3px); }`,
  `
  const SENTENCE = ${JSON.stringify(SENTENCE)};
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const SEL = 'rgba(66,129,231,0.30)';
  const selBg = (p) => (p <= 0 ? 'transparent' : 'linear-gradient(90deg,' + SEL + ' ' + p * 100 + '%, transparent ' + p * 100 + '%)');

  // 창이 쉬는 자리에서 커서·말풍선 위치를 한 번 잰다 (창이 미끄러지는 동안 좌표가 흔들리지 않게)
  $('typed').textContent = SENTENCE;
  $('itext').textContent = SENTENCE;
  const rect = (el) => el.getBoundingClientRect();
  const r = { typed: rect($('typed')), quote: rect($('quote')), input: rect($('itext')), send: rect($('send')), pasted: rect($('pasted')) };
  const P = {
    rest: { x: 1340, y: 690 },
    selA: { x: r.typed.left + 2, y: r.typed.top + r.typed.height / 2 },
    selB: { x: r.typed.right - 2, y: r.typed.top + r.typed.height / 2 },
    input: { x: r.input.left + 140, y: r.input.top + r.input.height / 2 },
    send: { x: r.send.left + r.send.width / 2, y: r.send.top + r.send.height / 2 },
    rest2: { x: 1240, y: 560 },
    qA: { x: r.quote.left + 4, y: r.quote.top + r.quote.height / 2 },
    qB: { x: r.quote.right - 4, y: r.quote.top + r.quote.height / 2 },
    docEnd: { x: r.typed.right + 8, y: r.typed.top + r.typed.height / 2 },
    rest3: { x: 1420, y: 700 },
  };
  // 떠 있는 버튼(Copy·Paste): [보이는 시작, 끝, 기준점, 글자, 누르는 시각]
  const PILLS = [
    [1.62, 2.1, { x: P.selB.x - 30, y: P.selB.y - 30 }, 'Copy', 1.85],
    [2.74, 3.06, { x: P.input.x + 40, y: P.input.y - 44 }, 'Paste', 3.0],
    [5.68, 6.12, { x: P.qB.x - 30, y: P.qB.y - 30 }, 'Copy', 5.95],
    [6.86, 7.24, { x: P.docEnd.x + 20, y: P.docEnd.y + 74 }, 'Paste', 7.15],
  ];
  const pillPoint = (i) => ({ x: PILLS[i][2].x, y: PILLS[i][2].y - 24 });
  // 커서 경로 [시각, 위치]
  const PATH = [
    [0, P.rest], [0.95, P.rest], [1.1, P.selA], [1.6, P.selB], [1.85, pillPoint(0)], [2.15, pillPoint(0)],
    [2.65, P.input], [2.72, P.input], [3.0, pillPoint(1)], [3.4, P.send], [3.9, P.rest2], [4.95, P.rest2],
    [5.15, P.qA], [5.65, P.qB], [5.95, pillPoint(2)], [6.2, pillPoint(2)],
    [6.75, P.docEnd], [6.86, P.docEnd], [7.15, pillPoint(3)], [7.7, P.rest3], [9, P.rest3],
  ];
  const CLICKS = [1.1, 1.85, 2.7, 3.0, 3.45, 5.15, 5.95, 6.8, 7.15];
  const BREAKS = [2.25, 4.3, 6.3]; // 흐름이 끊기는 순간: 창 전환, 기다림, 다시 전환
  const at = (t) => {
    for (let i = 0; i < PATH.length - 1; i++) {
      const [a, p] = PATH[i];
      const [b, q] = PATH[i + 1];
      if (t <= b) {
        const k = ease(prog(t, a, b));
        return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
      }
    }
    return PATH.at(-1)[1];
  };
  // 창 전환: 나가는 창은 왼쪽으로, 들어오는 창은 오른쪽에서 (휙)
  const SWITCHES = [[2.05, 2.45], [6.1, 6.5]];
  function windows(t) {
    let docShown = 1;
    if (t >= SWITCHES[0][0]) docShown = 1 - ease(prog(t, ...SWITCHES[0]));
    if (t >= SWITCHES[1][0]) docShown = ease(prog(t, ...SWITCHES[1]));
    const place = (el, k, dir) => {
      el.style.opacity = k;
      el.style.transform = 'translateX(' + (1 - k) * 160 * dir + 'px) scale(' + (0.96 + 0.04 * k) + ')';
      el.style.visibility = k <= 0.001 ? 'hidden' : 'visible';
    };
    const leaving = t < SWITCHES[1][0] ? -1 : 1; // 처음엔 문서가 왼쪽으로 나가고, 돌아올 때는 왼쪽에서 들어온다
    place($('doc'), docShown, leaving);
    place($('chat'), 1 - docShown, -leaving);
  }
  function zig(x, s, o) {
    return '<g transform="translate(' + x + ',0) scale(' + s + ')" opacity="' + o + '">' +
      '<path d="M -7 -24 L 7 -6 L -6 2 L 5 18" fill="none" stroke="#ef5d6c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M -3 14 L 6 21 L 9 10" fill="none" stroke="#ef5d6c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>';
  }
  function flow(t) {
    const head = 1000 * clamp(t / 8.2);
    const xs = BREAKS.map((b) => (1000 * b) / 8.2);
    const edges = [0, ...xs.flatMap((x) => [x - 26, x + 26]), 1000];
    let svg = '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop offset="0" stop-color="#4281e7"/><stop offset="1" stop-color="#28c8b8"/></linearGradient></defs>';
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i];
      const b = Math.min(edges[i + 1], head);
      if (b > a) svg += '<line x1="' + a + '" y1="0" x2="' + b + '" y2="0" stroke="url(#g)" stroke-width="6" stroke-linecap="round"/>';
    }
    BREAKS.forEach((b, i) => {
      if (t < b) return;
      const k = prog(t, b, b + 0.3);
      let s = k < 0.7 ? (k / 0.7) * 1.25 : 1.25 - 0.25 * ((k - 0.7) / 0.3);
      // 끝(8초~)에서는 쌓인 끊김 표시가 함께 두근거린다
      if (t > 8) s *= 1 + 0.3 * Math.sin(Math.PI * prog(t, 8, 9));
      svg += zig(xs[i], s, Math.min(1, k * 2));
    });
    $('fsvg').innerHTML = svg;
  }
  function pill(t) {
    const el = $('pill');
    const p = PILLS.find(([a, b]) => t >= a && t < b);
    if (!p) return (el.style.opacity = 0);
    const [a, b, pt, label, press] = p;
    el.style.left = pt.x + 'px';
    el.style.top = pt.y + 'px';
    el.textContent = t >= press ? (label === 'Copy' ? 'Copied ✓' : 'Pasted ✓') : label;
    el.style.background = t >= press ? '#1fa392' : '#10213d';
    el.style.opacity = Math.min(prog(t, a, a + 0.1), 1 - prog(t, b - 0.1, b));
  }
  function ripple(t, c) {
    const el = $('ripple');
    const click = CLICKS.filter((x) => x <= t).at(-1);
    const k = click === undefined ? 1 : prog(t, click, click + 0.5);
    el.style.left = c.x - 23 + 'px';
    el.style.top = c.y - 23 + 'px';
    el.style.opacity = k >= 1 ? 0 : 0.8 * (1 - k);
    el.style.transform = 'scale(' + (0.3 + 1.3 * k) + ')';
  }
  window.setTime = (t) => {
    windows(t);
    flow(t);
    // 문서: 한 문장을 쓰고 → 끌어 선택
    const typed = Math.round(SENTENCE.length * prog(t, 0.15, 0.95));
    $('typed').textContent = SENTENCE.slice(0, typed);
    const selDoc = t < 1.1 ? 0 : t < 2.1 ? ease(prog(t, 1.1, 1.6)) : 0;
    $('typed').style.background = selBg(selDoc);
    const typing = t > 0.15 && t < 0.95;
    $('caret').style.opacity = t < 1.1 && (typing || Math.floor(t * 2.2) % 2 === 0) ? 1 : t > 6.8 && t < 7.15 ? 1 : 0;
    // 다시 문서로 와서 붙여넣으면 민트색으로 빛난다
    const pk = prog(t, 7.18, 7.3);
    $('pasted').style.opacity = pk;
    $('pasted').style.background = 'rgba(80,221,203,' + 0.42 * (1 - prog(t, 7.6, 8.6)) * (pk > 0 ? 1 : 0) + ')';
    // AI 채팅: 붙여넣기 → Send → 점 세 개 → 답 → 끌어 선택
    const itext = $('itext');
    const pasted = t >= 3.0 && t < 3.45;
    itext.textContent = pasted ? SENTENCE : 'Ask anything…';
    itext.className = pasted ? '' : 'ph';
    $('ubub').style.opacity = prog(t, 3.45, 3.6);
    $('ubub').style.transform = 'translateY(' + 16 * (1 - prog(t, 3.45, 3.6)) + 'px)';
    $('abub').style.opacity = prog(t, 3.7, 3.85);
    const answered = t >= 4.9;
    $('dots').style.display = answered ? 'none' : 'inline-flex';
    $('answer').style.display = answered ? 'inline' : 'none';
    [...$('dots').children].forEach((d, i) => (d.style.opacity = 0.25 + 0.75 * Math.max(0, Math.sin((t * 2.6 - i * 0.33) * Math.PI))));
    $('answer').style.opacity = prog(t, 4.9, 5.05);
    $('quote').style.background = selBg(t < 5.15 ? 0 : t < 6.15 ? ease(prog(t, 5.15, 5.65)) : 0);
    $('send').style.filter = t >= 3.42 && t < 3.6 ? 'brightness(0.8)' : 'none';
    pill(t);
    const c = at(t);
    ripple(t, c);
    $('cursor').style.left = c.x + 'px';
    $('cursor').style.top = c.y + 'px';
  };
  $('typed').textContent = '';
  window.setTime(0);
  `,
);

app.disableHardwareAcceleration();
// 화면 배율(125%)과 화면 크기에 묶이지 않고 정확히 1920x1080으로 그린다
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function capture(win, path) {
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== 1920 || size.height !== 1080) throw new Error(`${path}: ${size.width}x${size.height}`);
  writeFileSync(path, image.toPNG());
}

app.whenReady().then(async () => {
  mkdirSync(join(OUT, 's02'), { recursive: true });
  const win = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  // 화면 밖 렌더링이라도 처음 크기는 작업 영역(작업 표시줄 제외)에 맞춰 잘린다. 만든 뒤 다시 키운다
  win.setContentSize(1920, 1080);
  const load = async (html) => {
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))');
  };
  for (const [name, html] of Object.entries({ s01, s03, bg })) {
    await load(html);
    await capture(win, join(OUT, `${name}.png`));
    console.log(name);
  }
  await load(s02);
  const frames = S02_SECONDS * FPS;
  for (let i = 0; i < frames; i++) {
    // 다음 그림이 그려질 때까지(두 번의 rAF) 기다렸다가 캡처
    await win.webContents.executeJavaScript(`setTime(${i / FPS}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await capture(win, join(OUT, 's02', `${String(i).padStart(4, '0')}.png`));
  }
  console.log(`s02 ${frames} frames`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
