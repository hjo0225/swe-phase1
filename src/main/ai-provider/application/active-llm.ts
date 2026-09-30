import type { ProviderId } from '../../../shared/ipc/ai-provider';
import { DomainError } from '../../platform/errors';
import type { AIProviderSettingsRepository } from '../domain/ai-provider-settings-repository';
import type { ModelCapabilities } from '../domain/model-capabilities';
import type { LLMProvider, LLMProviderFactory, SecretCipher } from './ports';

export interface ActiveModel {
  provider: ProviderId;
  model: string;
  capabilities: ModelCapabilities;
  client: LLMProvider;
}

/**
 * 타 도메인(assist) 공개 API: 지금 사용할 LLM (UC-AIP-004).
 * 매번 복호화·생성한다 — 설정 변경이 즉시 반영되고 평문 Key를 오래 들고 있지 않는다.
 */
export class ActiveLLM {
  constructor(
    private readonly repo: AIProviderSettingsRepository,
    private readonly cipher: SecretCipher,
    private readonly factory: LLMProviderFactory,
  ) {}

  resolve(): ActiveModel {
    const active = this.tryResolve();
    if (!active) throw new DomainError('AI_PROVIDER_NOT_CONFIGURED', 'No usable AI provider is configured');
    return active;
  }

  tryResolve(): ActiveModel | null {
    const entry = this.repo.load().active();
    if (!entry?.apiKey) return null;
    // 앱 업데이트로 모델이 카탈로그에서 빠진 경우도 "설정 필요"로 본다.
    const descriptor = this.factory.catalog().find(entry.provider, entry.model);
    if (!descriptor) return null;
    let apiKey: string;
    try {
      apiKey = this.cipher.decrypt(entry.apiKey);
    } catch {
      return null; // OS 계정·키체인이 바뀌어 복호화할 수 없음 → 다시 입력받는다
    }
    return {
      provider: entry.provider,
      model: entry.model,
      capabilities: descriptor.capabilities,
      client: this.factory.create(entry.provider, { apiKey, model: entry.model, baseUrl: entry.baseUrl ?? undefined }),
    };
  }
}
