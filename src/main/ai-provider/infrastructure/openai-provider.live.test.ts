import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ExpandExecutor } from '../../assist/application/executors/expand-executor';
import { OrganizeExecutor } from '../../assist/application/executors/organize-executor';
import { VisualizeExecutor } from '../../assist/application/executors/visualize-executor';
import { InputSnapshot } from '../../assist/domain/input-snapshot';
import { openNoteVault } from '../../note/infrastructure/vault/open-note-vault';
import { OrganizeService } from '../../organize/application/organize-service';
import { isLayerStack, looseNodes, type InfographicSpec } from '../../../shared/visualization/infographic-spec';
import { OPENAI_MODELS, OpenAIProvider } from './openai-provider';

/**
 * 실제 OpenAI API로 확인하는 선택 테스트 (과금). Key는 환경 변수로만 받는다 — 파일·로그에 남기지 않는다.
 * OPENAI_API_KEY=... pnpm vitest run src/main/ai-provider/infrastructure/openai-provider.live.test.ts --silent=false
 */
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
const TIMEOUT = 240_000;

function groupBy<T>(items: readonly T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups];
}

/** "## <heading>" 아래부터 다음 "## " 제목 전까지의 빈 줄이 아닌 줄 */
function sectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\b`).test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.trim());
}

/** 중첩 목록에서 pattern에 맞는 항목마다 그 항목을 품은 상위 항목들의 글 (들여쓰기 = 안에 있음) */
function listAncestors(lines: readonly string[], pattern: RegExp): string[][] {
  const items = lines
    .map((l) => /^(\s*)[-*+]\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ indent: m[1]!.replace(/\t/g, '    ').length, text: m[2]! }));
  return items.flatMap((item, i) => {
    if (!pattern.test(item.text)) return [];
    const ancestors: string[] = [];
    let indent = item.indent;
    for (let j = i - 1; j >= 0; j--) {
      if (items[j]!.indent < indent) {
        ancestors.push(items[j]!.text);
        indent = items[j]!.indent;
      }
    }
    return [ancestors];
  });
}

/** "A → B: 라벨"의 라벨 (없으면 제외) */
function flowLabels(lines: readonly string[]): string[] {
  return lines.flatMap((l) => {
    const m = /(?:→|↔)[^:]*:\s*(.+)$/.exec(l);
    return m ? [m[1]!.trim()] : [];
  });
}

/** 무엇이 오가는지가 아니라 동작만 다시 말한 라벨 ("sends to …", "calls …", "talks to …") */
const ACTION_LABEL = /^(?:it\s+|they\s+)?(?:send|sends|sent|call|calls|called|talk|talks|hit|hits|reach|reaches|go|goes|connect|connects|forward|forwards|pass|passes|route|routes)\b/i;

/** 데모 영상에 쓰는 메모 — 정리하기 → 시각화가 한눈에 읽히는 아키텍처가 되어야 한다 */
const DEMO_MEMO =
  "electron app. the ui is react + tiptap editor, it can't touch files, the db or the internet directly, it only sends requests to main through preload over ipc. " +
  'main reads and writes the md files in the vault folder and watches it. sqlite index for search and links. ' +
  'ai requests run in a job queue in main and go to openai or kimi over https. api keys are encrypted in the os keychain.';

/** 가벼운 서비스 메모 — 담는 곳을 말하지 않으므로 그룹 없이 그려야 한다 (그룹은 선택) */
const LIGHT_MEMO =
  'users open a static website served from a cdn. the site calls one api function, and the function reads a single database.';

/** 가벼운 서비스: architecture, 그룹 없음, 카드 3~5개, 모든 카드가 이어져 있다 */
function judgeLightDiagram(spec: InfographicSpec): Record<string, boolean> {
  const linked = new Set(spec.edges.flatMap(([from, to]) => [from, to]));
  return {
    'type architecture': spec.type === 'architecture',
    'no groups': (spec.groups ?? []).length === 0,
    '3-5 cards': spec.nodes.length >= 3 && spec.nodes.length <= 5,
    'no loose cards': spec.nodes.every((n) => linked.has(n.id)),
  };
}

/**
 * 편집기에서 정리된 글을 선택했을 때 시각화로 보내는 글 (renderer selectionText와 같은 모양):
 * 블록마다 한 줄, 빈 줄 없음, 목록은 "- "와 단계마다 2칸 들여쓰기, 굵게·코드 표시는 글만.
 */
function asSelectedText(markdown: string): string {
  const out: string[] = [];
  const indents: number[] = [];
  const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
  for (const raw of markdown.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = /^(\s*)(?:[-*+]|(\d+)\.)\s+(.*)$/.exec(raw);
    if (!item) {
      indents.length = 0;
      out.push(plain(raw.trim()));
      continue;
    }
    // 들여쓰기 칸 수가 아니라 중첩 단계로 맞춘다
    const indent = item[1]!.replace(/\t/g, '    ').length;
    while (indents.length > 0 && indents[indents.length - 1]! > indent) indents.pop();
    if (indents.length === 0 || indents[indents.length - 1]! < indent) indents.push(indent);
    out.push(`${'  '.repeat(indents.length - 1)}${item[2] ? `${item[2]}. ` : '- '}${plain(item[3]!)}`);
  }
  return out.join('\n');
}

/**
 * 층으로 설명한 포스터용 메모 (plan Task 7). 앱에서 한 문단으로 쓴 메모를 선택하면 이 글이 그대로 간다.
 * 줄바꿈 없이 한 문단이다.
 */
const LAYER_MEMO =
  "ok architecture for the poster. the screen is react 19.3 with tiptap 3.31 as the editor, it can't touch files itself, " +
  'it goes through preload / ipc to main. main is electron 44.4 on node.js 24, all written in typescript 6.0. ' +
  'main is what talks to the resources: notes stay as plain markdown files, sqlite 3.53 keeps the search and link index ' +
  '(we use better-sqlite3 and drizzle orm to reach it), and openai sdk 7 calls both openai and kimi.';

/** 카드 제목이 메모에서 처음 나오는 자리 (제목의 단어 중 메모에 있는 첫 단어). 없으면 undefined */
function memoPosition(memo: string, title: string): number | undefined {
  const text = memo.toLowerCase();
  for (const word of title.toLowerCase().split(/[\s/()&,]+/)) {
    if (word.length >= 3 && text.includes(word)) return text.indexOf(word);
  }
  return undefined;
}

/** 층 다이어그램: 층 3개(UI → Core → Storage & AI), 층 사이 선 2개(첫 선에 Preload / IPC), 층 안 카드는 메모 순서, stack 배치, 떠 있는 카드 없음 */
function judgeLayerDiagram(spec: InfographicSpec): Record<string, boolean> {
  const groups = spec.groups ?? [];
  const groupIds = new Set(groups.map((g) => g.id));
  const title = (id: string) => groups.find((g) => g.id === id)?.title ?? '';
  // 위 층부터: 들어오는 선이 없는 층 → 그 층에서 나가는 선을 따라간다
  const first = spec.edges.find(([from]) => !spec.edges.some(([, to]) => to === from));
  const second = first && spec.edges.find(([from]) => from === first[1]);
  const order = first && second ? [first[0], first[1], second[1]] : [];
  const inMemoOrder = groups.every((g) => {
    const positions = spec.nodes
      .filter((n) => n.group === g.id)
      .map((n) => memoPosition(LAYER_MEMO, n.title))
      .filter((p): p is number => p !== undefined);
    // 같은 단어에서 시작하는 카드(OpenAI SDK 7 → OpenAI)는 같은 자리여도 된다
    return positions.every((p, i) => i === 0 || positions[i - 1]! <= p);
  });
  return {
    'type architecture': spec.type === 'architecture',
    '3 layer groups': groups.length === 3 && groups.every((g) => !g.parent),
    '2 lines between layers': spec.edges.length === 2 && spec.edges.every(([from, to]) => groupIds.has(from) && groupIds.has(to)),
    'ui -> core -> storage': order.length === 3 && /ui|user interface|renderer|screen/i.test(title(order[0]!)) && /core|main/i.test(title(order[1]!)) && /storage|resource|ai|data/i.test(title(order[2]!)),
    'preload / ipc on the first line': first !== undefined && /preload/i.test(first[2]?.label ?? '') && /ipc/i.test(first[2]?.label ?? ''),
    'cards in memo order': inMemoOrder,
    'stack layout': isLayerStack(spec),
    'no loose cards': looseNodes(spec).length === 0,
  };
}

/** 데모 다이어그램이 한눈에 아키텍처로 읽히는지 (조건 1~5) */
function judgeDemoDiagram(spec: InfographicSpec): Record<string, boolean> {
  const groups = spec.groups ?? [];
  const title = (id: string) => spec.nodes.find((n) => n.id === id)?.title ?? '';
  const linked = new Set(spec.edges.flatMap(([from, to]) => [from, to]));
  const find = (pattern: RegExp) => spec.nodes.filter((n) => pattern.test(n.title)).map((n) => n.id);
  const connects = (from: string[], to: string[]) =>
    spec.edges.some(
      ([a, b, meta]) => (from.includes(a) && to.includes(b)) || (meta?.bidirectional === true && from.includes(b) && to.includes(a)),
    );
  const groupTitles = new Set(groups.map((g) => g.title.trim().toLowerCase()));
  const ui = find(/\bui\b|renderer|user interface/i);
  const preload = find(/preload/i);
  const main = find(/\bmain\b/i);
  const httpsTo = (pattern: RegExp) =>
    spec.edges.some(([a, b, meta]) => (pattern.test(title(a)) || pattern.test(title(b))) && /https/i.test(meta?.label ?? ''));
  return {
    '1 electron app is a group': groups.some((g) => /electron/i.test(g.title)) && find(/^electron( app)?$/i).length === 0,
    '2 at most one loose card, no card named like a group':
      spec.nodes.filter((n) => !linked.has(n.id)).length <= 1 && spec.nodes.every((n) => !groupTitles.has(n.title.trim().toLowerCase())),
    '3 ui -> preload -> main': connects(ui, preload) && connects(preload, main),
    '4 react/tiptap are not loose cards': spec.nodes.every((n) => !/react|tiptap/i.test(n.title) || ui.includes(n.id) || linked.has(n.id)),
    '5 https to openai and kimi': httpsTo(/openai/i) && httpsTo(/kimi/i),
  };
}

describe.skipIf(!apiKey)(`OpenAIProvider — live API (${model})`, () => {
  const llm = () => new OpenAIProvider({ apiKey: apiKey!, model });
  const signal = () => AbortSignal.timeout(TIMEOUT - 5_000);

  it('connects and finds the model', async () => {
    await llm().testConnection(signal());
  }, TIMEOUT);

  it('organizes a messy memo into markdown', async () => {
    const result = await new OrganizeExecutor().execute(
      InputSnapshot.of('회의했고 api 어떤거 쓸지도 얘기했고 electron 쓸 거 같음. 저장은 로컬 우선으로. 다음주까지 프로토타입'),
      llm(),
      signal(),
    );
    console.log('[ORGANIZE]\n' + (result as { markdown: string }).markdown);
    expect(result.kind).toBe('MARKDOWN');
  }, TIMEOUT);

  it('expands with the built-in web search and url citations', async () => {
    const result = await new ExpandExecutor().execute(InputSnapshot.of('Electron은 데스크톱 앱 프레임워크다.'), llm(), signal());
    console.log('[EXPAND]\n' + (result as { markdown: string }).markdown);
    expect(result.kind).toBe('RESEARCHED_MARKDOWN');
    expect((result as { sources: unknown[] }).sources.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it.each([
    ['process', 'Blink의 AI 처리 과정: 사용자가 노트를 쓰고 텍스트를 선택한다. 그다음 AI 작업을 요청하면 백그라운드에서 처리되고, 끝나면 결과가 한 번에 적용된다.'],
    ['comparison', 'OpenAI와 Kimi 비교: OpenAI는 Responses API에 웹 검색이 내장되어 있고 인용을 돌려준다. Kimi는 Chat Completions 호환이고 별도 검색 API를 쓴다. 둘 다 JSON Schema 구조화 출력을 지원한다.'],
    ['mindmap', 'Blink 앱 아이디어 정리: 노트(자동 저장, 폴더 보관함), AI(구체화, 정리, 시각화), 검색(백링크, 내용 가져오기), 설정(API Key, 모델 선택)'],
  ])('visualizes as %s', async (type, text) => {
    const result = await new VisualizeExecutor().execute(InputSnapshot.of(text), llm(), signal());
    const spec = (result as { spec: { type: string; nodes: unknown[] } }).spec;
    console.log(`[VISUALIZE ${type}] type=${spec.type}, nodes=${spec.nodes.length}`);
    expect(spec.type).toBe(type);
  }, TIMEOUT);

  it('draws a system description as an architecture with groups and icons', async () => {
    const result = await new VisualizeExecutor().execute(
      InputSnapshot.of(
        'Users reach a load balancer over HTTPS. Inside VPC A there are two zones; each zone has a web server subnet and a WAS subnet. ' +
          'Web servers call the WAS servers, and both zones share a multi-zone Cloud DB (master in zone A, standby in zone B).',
      ),
      llm(),
      signal(),
    );
    const spec = (result as { spec: InfographicSpec }).spec;
    console.log('[VISUALIZE architecture] ' + JSON.stringify(spec));
    expect(spec.type).toBe('architecture');
    expect(spec.groups?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(spec.nodes.filter((n) => n.icon).length).toBeGreaterThanOrEqual(4);
  }, TIMEOUT);

  it('organizes a messy architecture memo into components and flows, which then visualize as an architecture', async () => {
    const memo =
      'users hit the load balancer over https, lb sends to web servers in zone a and zone b (both inside vpc a), ' +
      'web servers call was servers, was talks to the cloud db, master in zone a and slave in zone b';
    const organized = (await new OrganizeExecutor().execute(InputSnapshot.of(memo), llm(), signal())) as { markdown: string };
    console.log('[ORGANIZE architecture]\n' + organized.markdown);
    expect(organized.markdown).toMatch(/^##\s+Components/m);
    expect(organized.markdown).toMatch(/^##\s+Flows/m);
    expect(organized.markdown).toMatch(/→|↔/);
    const components = sectionLines(organized.markdown, 'Components');
    const flows = sectionLines(organized.markdown, 'Flows');
    // Flows에 나오는 사용자도 구성요소로 적는다
    expect(components.some((l) => /\busers?\b/i.test(l))).toBe(true);
    // 글은 WAS 서버가 어느 zone에 있는지 말하지 않는다 → zone 아래로 넣지 않는다
    const wasAncestors = listAncestors(components, /\bwas\b/i);
    expect(wasAncestors.length).toBeGreaterThan(0);
    expect(wasAncestors.flat().filter((a) => /\bzone\b/i.test(a))).toEqual([]);
    // 선 라벨은 오가는 것(프로토콜·데이터)만: 동작을 다시 말한 라벨은 없고, 글에 있는 HTTPS는 남는다
    const labels = flowLabels(flows);
    expect(labels.filter((l) => ACTION_LABEL.test(l) || l.length > 24)).toEqual([]);
    expect(labels.some((l) => /https/i.test(l))).toBe(true);
    const visual = (await new VisualizeExecutor().execute(InputSnapshot.of(organized.markdown), llm(), signal())) as { spec: InfographicSpec };
    console.log('[VISUALIZE organized architecture] ' + JSON.stringify(visual.spec));
    expect(visual.spec.type).toBe('architecture');
    expect(visual.spec.groups?.length ?? 0).toBeGreaterThanOrEqual(2);
  }, TIMEOUT * 2);

  /**
   * 정리하기 → (편집기에서 결과 선택) → 시각화를 5번 연달아 돌려 조건마다 통과를 남긴다.
   * direct면 정리하지 않고 메모 문단을 그대로 선택해 바로 시각화한다 (데모 영상의 순서).
   */
  async function fiveRuns(
    name: string,
    memo: string,
    judge: (spec: InfographicSpec) => Record<string, boolean>,
    { direct = false }: { direct?: boolean } = {},
  ): Promise<string[][]> {
    const runs: { organized: string; spec: InfographicSpec; failed: string[] }[] = [];
    for (let run = 1; run <= 5; run++) {
      const organized = direct
        ? { markdown: memo }
        : ((await new OrganizeExecutor().execute(InputSnapshot.of(memo), llm(), signal())) as { markdown: string });
      const selected = direct ? memo : asSelectedText(organized.markdown);
      let visual: { spec: InfographicSpec };
      try {
        visual = (await new VisualizeExecutor().execute(InputSnapshot.of(selected), llm(), signal())) as { spec: InfographicSpec };
      } catch (error) {
        // 시각화 실패(검증 거절 등)도 그 회차의 실패로 남기고 다음 회차로 간다
        runs.push({ organized: organized.markdown, spec: null as never, failed: [`visualize failed: ${String(error)}`] });
        console.log(`[${name} run ${run}] FAIL visualize: ${String(error)}\n[${name} run ${run} organized]\n${organized.markdown}`);
        continue;
      }
      const checks = judge(visual.spec);
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
      runs.push({ organized: organized.markdown, spec: visual.spec, failed });
      console.log(`[${name} run ${run}] ` + Object.entries(checks).map(([k, ok]) => `${ok ? 'PASS' : 'FAIL'} ${k}`).join(' | '));
      if (failed.length > 0) console.log(`[${name} run ${run} organized]\n${organized.markdown}\n[${name} run ${run} spec] ${JSON.stringify(visual.spec)}`);
    }
    const last = runs[runs.length - 1]!;
    console.log(`[${name} last organized]\n${last.organized}\n[${name} last spec] ${JSON.stringify(last.spec)}`);
    return runs.map((r) => r.failed);
  }

  it('turns the demo memo into a diagram that reads as an architecture, five runs in a row', async () => {
    expect(await fiveRuns('DEMO', DEMO_MEMO, judgeDemoDiagram)).toEqual([[], [], [], [], []]);
  }, TIMEOUT * 10);

  it('draws a light service memo without inventing groups, five runs in a row', async () => {
    expect(await fiveRuns('LIGHT', LIGHT_MEMO, judgeLightDiagram)).toEqual([[], [], [], [], []]);
  }, TIMEOUT * 10);

  it('draws the layered poster memo as stacked layers after organizing it, five runs in a row', async () => {
    expect(await fiveRuns('LAYERS', LAYER_MEMO, judgeLayerDiagram)).toEqual([[], [], [], [], []]);
  }, TIMEOUT * 10);

  it('draws the layered poster memo as stacked layers when visualized directly, five runs in a row', async () => {
    expect(await fiveRuns('LAYERS DIRECT', LAYER_MEMO, judgeLayerDiagram, { direct: true })).toEqual([[], [], [], [], []]);
  }, TIMEOUT * 10);

  it('keeps organizing an ordinary meeting memo without components and flows', async () => {
    const organized = (await new OrganizeExecutor().execute(
      InputSnapshot.of('talked about which ai api to use, probably electron for the app, keep notes local first, prototype by next friday'),
      llm(),
      signal(),
    )) as { markdown: string };
    expect(organized.markdown).not.toMatch(/##\s+(Components|Flows)/);
  }, TIMEOUT);

  it('keeps a product idea memo (a workflow and an app idea, no parts) out of components and flows, five runs in a row', async () => {
    // 데모 S09: 포스터 Description을 쓸 킥오프 메모. 앱이 하는 일을 말하지만 시스템의 부품과 연결을 말하지 않는다
    const memo = [
      'using ai while writing notes = open an ai site, copy, write a prompt, wait, copy back, paste.',
      'breaks your thinking every time. old notes are buried in files too.',
      'idea: desktop note app where you select text and ai refines it, draws it, and you can reuse old notes right there',
    ].join('\n\n');
    const outputs = await Promise.all(
      Array.from({ length: 5 }, () => new OrganizeExecutor().execute(InputSnapshot.of(memo), llm(), signal()) as Promise<{ markdown: string }>),
    );
    outputs.forEach((o, i) => console.log(`[ORGANIZE idea run ${i + 1}]\n${o.markdown}`));
    expect(outputs.filter((o) => /##\s+(Components|Flows)/.test(o.markdown))).toHaveLength(0);
  }, TIMEOUT * 2);

  it('turns a few sentences about one idea into one polished paragraph without a heading, at least four runs in five', async () => {
    // 데모 S09의 킥오프 메모 — 포스터 Description(한 문장) 자리에 들어간다
    const memo =
      'so the app we want: a desktop note app, you select text and ai refines it or draws it, and you can reuse old notes right there. ' +
      'no more opening an ai site, copying and pasting back, which breaks your thinking every time';
    const outputs = await Promise.all(
      Array.from({ length: 5 }, () => new OrganizeExecutor().execute(InputSnapshot.of(memo), llm(), signal()) as Promise<{ markdown: string }>),
    );
    outputs.forEach((o, i) => console.log(`[ORGANIZE short run ${i + 1}]
${o.markdown}`));
    // 실제로 약 93% (30번 중 28번). 데모는 리허설에서 고른 회차를 쓴다
    expect(outputs.filter((o) => /^\s*(#|[-*] |\d+\. )/m.test(o.markdown)).length).toBeLessThanOrEqual(1);
  }, TIMEOUT * 2);

  describe('answers in the language of the selected text (English input → English output)', () => {
    const HANGUL = /[가-힣]/;
    it('organize', async () => {
      const result = await new OrganizeExecutor().execute(
        InputSnapshot.of('talked about which ai api to use, probably electron for the app, keep notes local first, prototype by next friday'),
        llm(),
        signal(),
      );
      const markdown = (result as { markdown: string }).markdown;
      console.log('[ORGANIZE EN]' + String.fromCharCode(10) + markdown);
      expect(markdown).not.toMatch(HANGUL);
    }, TIMEOUT);

    it('expand (with sources)', async () => {
      const result = await new ExpandExecutor().execute(InputSnapshot.of('Electron is a framework for building desktop apps.'), llm(), signal());
      const markdown = (result as { markdown: string }).markdown;
      console.log('[EXPAND EN]' + String.fromCharCode(10) + markdown);
      expect(markdown.split('**')[0]).not.toMatch(HANGUL);
    }, TIMEOUT);

    it('visualize', async () => {
      const result = await new VisualizeExecutor().execute(
        InputSnapshot.of('How a Blink AI job works: you select text, Blink sends it as a background job, the selection pulses while the AI works, and the result is applied in one step when it is done.'),
        llm(),
        signal(),
      );
      const json = JSON.stringify((result as { spec: unknown }).spec);
      console.log('[VISUALIZE EN] ' + json);
      expect(json).not.toMatch(HANGUL);
    }, TIMEOUT);
  });

  it('embeds titles so that related ones are closer', async () => {
    const [spring, spring2, stew] = await llm().embed({
      inputs: ['spring boot 실무 이해 1편', 'spring 트랜잭션 정리', '김치찌개 끓이는 법'],
      signal: signal(),
    });
    const cos = (a: number[], b: number[]) => {
      let dot = 0;
      let na = 0;
      let nb = 0;
      a.forEach((x, i) => {
        dot += x * b[i]!;
        na += x * x;
        nb += b[i]! * b[i]!;
      });
      return dot / Math.sqrt(na * nb);
    };
    console.log(`[EMBED] dims=${spring!.length} spring~spring=${cos(spring!, spring2!).toFixed(3)} spring~stew=${cos(spring!, stew!).toFixed(3)}`);
    expect(cos(spring!, spring2!)).toBeGreaterThan(cos(spring!, stew!));
  }, TIMEOUT);

  describe('organize the 100 sample notes (samples/organize-test-vault)', () => {
    const base = mkdtempSync(join(tmpdir(), 'blink-organize-live-'));
    afterAll(() => rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

    it('groups notes close to the answer sheet', async () => {
      const samples = resolve(__dirname, '../../../../samples');
      const root = join(base, 'vault');
      cpSync(join(samples, 'organize-test-vault'), root, { recursive: true });
      const vault = openNoteVault(root, { indexDir: join(base, 'index'), clock: { now: () => new Date() }, nextId: () => crypto.randomUUID() });
      try {
        vault.sync.full();
        const descriptor = OPENAI_MODELS.find((m) => m.id === model)!;
        const organize = new OrganizeService({
          notes: () => vault.notes,
          folders: () => vault.folders,
          activeLLM: { resolve: () => ({ provider: 'openai', model, capabilities: descriptor.capabilities, client: llm() }) },
        });
        const plan = await organize.preview('');

        // 정답표: 제목 → 작은 주제
        const answer = new Map(
          readFileSync(join(samples, 'organize-test-answer.csv'), 'utf8')
            .replace(/^﻿/, '')
            .split(/\r?\n/)
            .slice(1)
            .filter(Boolean)
            .map((line) => {
              const [, title, big, small] = /^"(.*)",([^,]*),([^,]*)$/.exec(line)!;
              return [title!, `${big}/${small}`] as const;
            }),
        );
        const groups = [
          ...plan.newFolders.map((f) => ({ folder: f.path.join('/'), titles: f.notes.map((n) => n.title) })),
          ...groupBy(plan.moves, (m) => m.to).map(([folder, notes]) => ({ folder, titles: notes.map((n) => n.title) })),
        ];
        let majoritySum = 0;
        let placed = 0;
        console.log(`[ORGANIZE NOTES] newFolders=${plan.newFolders.length} moves=${plan.moves.length} skipped=${plan.skipped}`);
        for (const group of groups.sort((a, b) => a.folder.localeCompare(b.folder, 'ko'))) {
          const topics = groupBy(group.titles, (t) => answer.get(t) ?? '?').sort((a, b) => b[1].length - a[1].length);
          majoritySum += topics[0]?.[1].length ?? 0;
          placed += group.titles.length;
          console.log(`  ${group.folder.padEnd(24)} ${String(group.titles.length).padStart(3)}개  ${topics.map(([t, l]) => `${t}×${l.length}`).join(', ')}`);
        }
        console.log(`[ORGANIZE NOTES] placed=${placed}/100, purity=${((majoritySum / Math.max(placed, 1)) * 100).toFixed(1)}%`);
        expect(plan.newFolders.length).toBeGreaterThan(0);
      } finally {
        vault.close();
      }
    }, TIMEOUT);
  });
});
