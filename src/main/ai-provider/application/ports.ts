import type { ProviderId } from '../../../shared/ipc/ai-provider';
import type { EncryptedSecret } from '../domain/ai-provider-settings';
import type { ModelCatalog } from '../domain/model-catalog';

/** assist가 쓰는 LLM 추상화 (docs/backend/ai-provider/application-flows.md). 구현: OpenAIProvider. */
export interface LLMProvider {
  testConnection(signal: AbortSignal): Promise<void>;
  generateText(request: { system: string; user: string; signal: AbortSignal }): Promise<string>;
  /** 파싱된 JSON을 돌려준다. 형식 검증은 호출자 책임. */
  generateStructured(request: {
    system: string;
    user: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<unknown>;
  researchAndGenerate(request: {
    system: string;
    user: string;
    signal: AbortSignal;
  }): Promise<{ text: string; sources: { title: string; url: string }[] }>;
}

export type ProviderErrorKind = 'AUTH' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'BAD_RESPONSE' | 'UNSUPPORTED';

/** 어댑터가 던지는 유일한 오류. SDK 예외 메시지(요청 내용·헤더가 섞일 수 있음)는 여기로 옮기지 않는다. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface LLMProviderFactory {
  create(provider: ProviderId, config: { apiKey: string; model: string; baseUrl?: string }): LLMProvider;
  catalog(): ModelCatalog;
}

export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): EncryptedSecret;
  decrypt(secret: EncryptedSecret): string;
}
