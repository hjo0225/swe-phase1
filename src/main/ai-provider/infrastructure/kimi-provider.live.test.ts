import { describe, expect, it } from 'vitest';
import { InputSnapshot } from '../../assist/domain/input-snapshot';
import { ExpandExecutor } from '../../assist/application/executors/expand-executor';
import { OrganizeExecutor } from '../../assist/application/executors/organize-executor';
import { VisualizeExecutor } from '../../assist/application/executors/visualize-executor';
import { KimiProvider } from './kimi-provider';

/**
 * 실제 Kimi API로 확인하는 선택 테스트 (과금). Key는 환경 변수로만 받는다 — 파일·로그에 남기지 않는다.
 * KIMI_API_KEY=... pnpm vitest run src/main/ai-provider/infrastructure/kimi-provider.live.test.ts
 */
const apiKey = process.env.KIMI_API_KEY;
const model = process.env.KIMI_MODEL ?? 'kimi-k2.6';
const TIMEOUT = 180_000;

describe.skipIf(!apiKey)(`KimiProvider — live API (${model})`, () => {
  const llm = () => new KimiProvider({ apiKey: apiKey!, model });
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

  it('expands with web search and real sources', async () => {
    const result = await new ExpandExecutor().execute(InputSnapshot.of('Electron은 데스크톱 앱 프레임워크다.'), llm(), signal());
    console.log('[EXPAND]\n' + (result as { markdown: string }).markdown);
    expect(result.kind).toBe('RESEARCHED_MARKDOWN');
    expect((result as { sources: unknown[] }).sources.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('visualizes into a valid infographic spec', async () => {
    const result = await new VisualizeExecutor().execute(
      InputSnapshot.of(
        'Blink의 AI 처리 과정: 사용자가 노트를 쓰고 텍스트를 선택한다. 그다음 AI 작업을 요청하면 백그라운드에서 처리되고, 끝나면 결과가 한 번에 적용된다.',
      ),
      llm(),
      signal(),
    );
    console.log('[VISUALIZE]\n' + JSON.stringify((result as { spec: unknown }).spec, null, 2));
    expect(result.kind).toBe('INFOGRAPHIC');
  }, TIMEOUT);

  it.each([
    ['comparison', 'OpenAI와 Kimi 비교: OpenAI는 Responses API에 웹 검색이 내장되어 있고 인용을 돌려준다. Kimi는 Chat Completions 호환이고 별도 검색 API를 쓴다. 둘 다 JSON Schema 구조화 출력을 지원한다.'],
    ['mindmap', 'Blink 앱 아이디어 정리: 노트(자동 저장, 폴더 보관함), AI(구체화, 정리, 시각화), 검색(백링크, 내용 가져오기), 설정(API Key, 모델 선택)'],
  ])('picks the %s type when the text calls for it', async (type, text) => {
    const result = await new VisualizeExecutor().execute(InputSnapshot.of(text), llm(), signal());
    const spec = (result as { spec: { type: string; nodes: unknown[] } }).spec;
    console.log(`[VISUALIZE ${type}] type=${spec.type}, nodes=${spec.nodes.length}`);
    expect(spec.type).toBe(type);
  }, TIMEOUT);
});
