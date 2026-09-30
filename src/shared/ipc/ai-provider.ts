import type { Capabilities } from '../assist/capabilities';

/** ai-provider IPC 계약 — docs/backend/ai-provider/api-contract.md */

export type ProviderId = 'openai' | 'kimi';

export interface ModelOption {
  id: string;
  label: string;
  capabilities: Capabilities;
}

export interface ProviderSummary {
  provider: ProviderId;
  label: string;
  isActive: boolean;
  model: string | null;
  baseUrl: string | null;
  /** Key 자체는 절대 반환하지 않는다 (BR-AIP-05) */
  hasApiKey: boolean;
  /** 비어 있으면 아직 지원하지 않는 Provider */
  models: ModelOption[];
}

export interface ProviderSettingsView {
  secureStorageAvailable: boolean;
  active: { provider: ProviderId; model: string; capabilities: Capabilities } | null;
  providers: ProviderSummary[];
}

export interface UpdateProviderInput {
  provider: ProviderId;
  model: string;
  /** 생략 = 기존 Key 유지 */
  apiKey?: string;
  /** null = 기본값으로 초기화, 생략 = 유지 */
  baseUrl?: string | null;
}

export interface TestProviderInput {
  provider: ProviderId;
  model: string;
  /** 생략하면 저장된 Key로 테스트 */
  apiKey?: string;
  baseUrl?: string;
}

export type ConnectionFailureCode = 'AUTH_FAILED' | 'MODEL_NOT_FOUND' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'TIMEOUT';

export type TestProviderResult = { ok: true } | { ok: false; failure: { code: ConnectionFailureCode } };
