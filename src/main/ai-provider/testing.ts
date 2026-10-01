import type { ProviderId } from '../../shared/ipc/ai-provider';
import type { LLMProvider, LLMProviderFactory, SecretCipher } from './application/ports';
import { ModelCapabilities } from './domain/model-capabilities';
import { ModelCatalog } from './domain/model-catalog';

/** 테스트 전용 도우미. */

export const testCatalog = new ModelCatalog({
  openai: [
    {
      id: 'full-model',
      label: 'Full',
      capabilities: new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: true }),
    },
    {
      id: 'text-model',
      label: 'Text only',
      capabilities: new ModelCapabilities({ generate: true, structuredOutput: false, webSearch: false }),
    },
  ],
  kimi: [],
});

/** 평문을 뒤집어 저장한다 — 저장된 값이 평문이 아님을 테스트에서 확인할 수 있다. */
export class FakeCipher implements SecretCipher {
  available = true;
  isAvailable() {
    return this.available;
  }
  encrypt(plain: string) {
    return new TextEncoder().encode([...plain].reverse().join(''));
  }
  decrypt(secret: Uint8Array) {
    return [...new TextDecoder().decode(secret)].reverse().join('');
  }
}

export function fakeProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    testConnection: async () => undefined,
    generateText: async () => 'generated',
    generateStructured: async () => ({}),
    researchAndGenerate: async () => ({ text: 'researched', sources: [] }),
    embed: async ({ inputs }) => inputs.map(() => [1]),
    ...overrides,
  };
}

export class FakeFactory implements LLMProviderFactory {
  created: { provider: ProviderId; apiKey: string; model: string; baseUrl?: string }[] = [];
  constructor(public provider: LLMProvider = fakeProvider()) {}
  create(provider: ProviderId, config: { apiKey: string; model: string; baseUrl?: string }) {
    this.created.push({ provider, ...config });
    return this.provider;
  }
  catalog() {
    return testCatalog;
  }
}
