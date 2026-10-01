import { ProviderError, type LLMProvider, type LLMProviderFactory } from '../application/ports';
import { ModelCatalog } from '../domain/model-catalog';
import { KIMI_MODELS } from './kimi-provider';
import { OPENAI_MODELS } from './openai-provider';

/**
 * E2E·수동 확인 전용 가짜 LLM. 실제 API Key 없이 AI 흐름 전체(요청 → 잠금 → 완료 → 적용)를 실행한다.
 * 패키징된 앱에서는 절대 쓰지 않는다 (bootstrap에서 !app.isPackaged && BLINK_FAKE_LLM=1 일 때만).
 * 입력에 `#fail`이 있으면 PROVIDER_UNAVAILABLE로 실패한다.
 */
export function createFakeLLMProviderFactory(delayMs = 800): LLMProviderFactory {
  const catalog = new ModelCatalog({ openai: OPENAI_MODELS, kimi: KIMI_MODELS });
  const wait = (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new ProviderError('UNAVAILABLE', 'aborted'));
      });
    });
  const guard = (user: string) => {
    if (user.includes('#fail')) throw new ProviderError('UNAVAILABLE', 'fake failure');
  };

  return {
    catalog: () => catalog,
    create(_provider, config): LLMProvider {
      return {
        async testConnection() {
          if (config.apiKey === 'bad-key') throw new ProviderError('AUTH', 'fake auth failure');
        },
        // 단어마다 정해진 칸에 1을 더한 가짜 임베딩 — 같은 단어가 많은 제목끼리 가깝다
        async embed({ inputs }) {
          return inputs.map((text) => {
            const vector = new Array<number>(64).fill(0);
            for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
              let hash = 0;
              for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) % 64;
              vector[hash] = (vector[hash] ?? 0) + 1;
            }
            return vector;
          });
        },
        async generateText({ user, signal }) {
          await wait(signal);
          guard(user);
          return `## 정리된 메모\n\n- ${user.trim()}`;
        },
        async researchAndGenerate({ user, signal }) {
          await wait(signal);
          guard(user);
          return {
            text: `${user.trim()} — Chromium과 Node.js를 기반으로 데스크톱 앱을 만든다.`,
            sources: [{ title: 'Electron 문서', url: 'https://www.electronjs.org/docs/latest' }],
          };
        },
        async generateStructured({ user, schemaName, signal }) {
          await wait(signal);
          guard(user);
          // organize의 폴더 이름 짓기 (FOLDER_NAMES_SCHEMA) — 묶음 수만큼 «묶음1», «묶음2»…
          if (schemaName === 'folder_names') {
            const count = user.split('\n').filter((line) => line.startsWith('묶음 ')).length;
            return { names: Array.from({ length: count }, (_, i) => `묶음${i + 1}`) };
          }
          return {
            version: 1,
            type: 'process',
            title: '처리 과정',
            nodes: [
              { id: '1', title: '노트 작성', description: user.slice(0, 40) },
              { id: '2', title: 'AI 처리', description: '선택 영역 분석' },
              { id: '3', title: '결과', description: '인포그래픽 생성' },
            ],
            edges: [
              ['1', '2'],
              ['2', '3'],
            ],
          };
        },
      };
    },
  };
}
