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
import type { InfographicSpec } from '../../../shared/visualization/infographic-spec';
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

  it('keeps organizing an ordinary meeting memo without components and flows', async () => {
    const organized = (await new OrganizeExecutor().execute(
      InputSnapshot.of('talked about which ai api to use, probably electron for the app, keep notes local first, prototype by next friday'),
      llm(),
      signal(),
    )) as { markdown: string };
    expect(organized.markdown).not.toMatch(/##\s+(Components|Flows)/);
  }, TIMEOUT);

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
