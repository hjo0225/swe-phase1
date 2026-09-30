import { ProviderError, type LLMProviderFactory } from '../application/ports';
import { ModelCatalog } from '../domain/model-catalog';
import { OPENAI_MODELS, OpenAIProvider } from './openai-provider';

/** 어댑터별 카탈로그를 합치고 Provider에 맞는 어댑터를 만든다. Kimi 어댑터는 아직 없다(카탈로그가 비어 선택 불가). */
export function createLLMProviderFactory(): LLMProviderFactory {
  const catalog = new ModelCatalog({ openai: OPENAI_MODELS, kimi: [] });
  return {
    catalog: () => catalog,
    create(provider, config) {
      if (provider === 'openai') return new OpenAIProvider(config);
      throw new ProviderError('UNSUPPORTED', `${provider} is not supported yet`);
    },
  };
}
