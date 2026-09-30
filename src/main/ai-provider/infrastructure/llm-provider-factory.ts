import { ProviderError, type LLMProviderFactory } from '../application/ports';
import { ModelCatalog } from '../domain/model-catalog';
import { KIMI_MODELS, KimiProvider } from './kimi-provider';
import { OPENAI_MODELS, OpenAIProvider } from './openai-provider';

/** 어댑터별 카탈로그를 합치고 Provider에 맞는 어댑터를 만든다. */
export function createLLMProviderFactory(): LLMProviderFactory {
  const catalog = new ModelCatalog({ openai: OPENAI_MODELS, kimi: KIMI_MODELS });
  return {
    catalog: () => catalog,
    create(provider, config) {
      if (provider === 'openai') return new OpenAIProvider(config);
      if (provider === 'kimi') return new KimiProvider(config);
      throw new ProviderError('UNSUPPORTED', `${provider} is not supported yet`);
    },
  };
}
