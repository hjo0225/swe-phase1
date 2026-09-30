import type {
  ConnectionFailureCode,
  ProviderId,
  ProviderSettingsView,
  TestProviderInput,
  TestProviderResult,
  UpdateProviderInput,
} from '../../../shared/ipc/ai-provider';
import type { Clock } from '../../platform/clock';
import { DomainError } from '../../platform/errors';
import { runWithTimeout, TimeoutError } from '../../platform/timeout';
import type { AIProviderSettingsRepository } from '../domain/ai-provider-settings-repository';
import { normalizeBaseUrl } from '../domain/base-url';
import { ProviderError, type LLMProviderFactory, type ProviderErrorKind, type SecretCipher } from './ports';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'kimi', label: 'Kimi' },
];
const TEST_TIMEOUT_MS = 10_000;

const CONNECTION_FAILURE: Record<ProviderErrorKind, ConnectionFailureCode> = {
  AUTH: 'AUTH_FAILED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  BAD_RESPONSE: 'UNAVAILABLE',
  UNSUPPORTED: 'UNAVAILABLE',
};

/** UC-AIP-001~003. API Key는 이 서비스 밖으로 평문으로 나가지 않는다. */
export class ProviderSettingsService {
  constructor(
    private readonly repo: AIProviderSettingsRepository,
    private readonly cipher: SecretCipher,
    private readonly factory: LLMProviderFactory,
    private readonly clock: Clock,
  ) {}

  get(): ProviderSettingsView {
    const settings = this.repo.load();
    const catalog = this.factory.catalog();
    const active = settings.active();
    const activeModel = active ? catalog.find(active.provider, active.model) : null;
    return {
      secureStorageAvailable: this.cipher.isAvailable(),
      active:
        active && activeModel
          ? { provider: active.provider, model: active.model, capabilities: activeModel.capabilities.toJSON() }
          : null,
      providers: PROVIDERS.map(({ id, label }) => {
        const entry = settings.entryOf(id);
        return {
          provider: id,
          label,
          isActive: settings.activeProviderId === id,
          model: entry?.model ?? null,
          baseUrl: entry?.baseUrl ?? null,
          hasApiKey: Boolean(entry?.apiKey),
          models: catalog.modelsOf(id).map((m) => ({ id: m.id, label: m.label, capabilities: m.capabilities.toJSON() })),
        };
      }),
    };
  }

  update(input: UpdateProviderInput): ProviderSettingsView {
    let encryptedApiKey: Uint8Array | undefined;
    if (input.apiKey !== undefined) {
      // D-08: 보안 저장소가 없으면 평문으로 저장하지 않고 거부한다.
      if (!this.cipher.isAvailable()) {
        throw new DomainError('PROVIDER_SECURE_STORAGE_UNAVAILABLE', 'OS secure storage is not available');
      }
      encryptedApiKey = this.cipher.encrypt(input.apiKey.trim());
    }
    const settings = this.repo.load();
    settings.configure(
      { provider: input.provider, model: input.model, encryptedApiKey, baseUrl: input.baseUrl },
      this.factory.catalog(),
      this.clock.now(),
    );
    this.repo.save(settings);
    return this.get();
  }

  /** 입력 중인 Key(없으면 저장된 Key)로 최소 요청을 보낸다. 아무것도 저장하지 않는다. */
  async test(input: TestProviderInput): Promise<TestProviderResult> {
    this.factory.catalog().require(input.provider, input.model);
    const entry = this.repo.load().entryOf(input.provider);
    const apiKey = input.apiKey?.trim() || (entry?.apiKey ? this.cipher.decrypt(entry.apiKey) : undefined);
    if (!apiKey) throw new DomainError('PROVIDER_API_KEY_REQUIRED', 'No API key to test with');
    const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl) : (entry?.baseUrl ?? undefined);

    const client = this.factory.create(input.provider, { apiKey, model: input.model, baseUrl });
    try {
      await runWithTimeout((signal) => client.testConnection(signal), TEST_TIMEOUT_MS);
      return { ok: true };
    } catch (error) {
      if (error instanceof ProviderError) return { ok: false, failure: { code: CONNECTION_FAILURE[error.kind] } };
      if (error instanceof TimeoutError) return { ok: false, failure: { code: 'TIMEOUT' } };
      throw error;
    }
  }
}
