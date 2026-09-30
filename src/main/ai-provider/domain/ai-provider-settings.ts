import type { ProviderId } from '../../../shared/ipc/ai-provider';
import { DomainError } from '../../platform/errors';
import { normalizeBaseUrl } from './base-url';
import type { ModelCatalog } from './model-catalog';

/** safeStorage 암호문. 도메인은 평문을 보지 않는다. */
export type EncryptedSecret = Uint8Array;

export interface ProviderSetting {
  provider: ProviderId;
  model: string;
  /** null이면 어댑터 기본값 */
  baseUrl: string | null;
  apiKey: EncryptedSecret | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfigureInput {
  provider: ProviderId;
  model: string;
  /** 생략하면 기존 Key 유지 */
  encryptedApiKey?: EncryptedSecret;
  /** 생략 = 유지, null = 기본값으로 */
  baseUrl?: string | null;
}

/**
 * Provider별 설정 전체. "활성 Provider는 최대 1개이고 Key를 가진다"는 규칙이 여러 설정에 걸쳐 있어
 * 전체를 하나의 애그리거트로 둔다 (BR-AIP-01).
 */
export class AIProviderSettings {
  private constructor(
    private readonly entries: Map<ProviderId, ProviderSetting>,
    private activeProvider: ProviderId | null,
  ) {}

  static empty(): AIProviderSettings {
    return new AIProviderSettings(new Map(), null);
  }

  static restore(entries: ProviderSetting[], activeProvider: ProviderId | null): AIProviderSettings {
    return new AIProviderSettings(new Map(entries.map((e) => [e.provider, e])), activeProvider);
  }

  /** 설정을 추가·갱신하고 그 Provider를 활성으로 만든다 (설정 화면에서 저장한 Provider가 사용 중인 Provider). */
  configure(input: ConfigureInput, catalog: ModelCatalog, now: Date): void {
    catalog.require(input.provider, input.model);
    const current = this.entries.get(input.provider);
    const next: ProviderSetting = {
      provider: input.provider,
      model: input.model,
      baseUrl:
        input.baseUrl === undefined ? (current?.baseUrl ?? null) : input.baseUrl === null ? null : normalizeBaseUrl(input.baseUrl),
      apiKey: input.encryptedApiKey ?? current?.apiKey ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (!next.apiKey) throw new DomainError('PROVIDER_API_KEY_REQUIRED', `${input.provider} needs an API key`);
    this.entries.set(input.provider, next);
    this.activeProvider = input.provider;
  }

  active(): ProviderSetting | null {
    return this.activeProvider ? (this.entries.get(this.activeProvider) ?? null) : null;
  }

  entryOf(provider: ProviderId): ProviderSetting | null {
    return this.entries.get(provider) ?? null;
  }

  all(): ProviderSetting[] {
    return [...this.entries.values()];
  }

  get activeProviderId(): ProviderId | null {
    return this.activeProvider;
  }
}
