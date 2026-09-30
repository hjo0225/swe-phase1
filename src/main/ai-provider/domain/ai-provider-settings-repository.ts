import type { AIProviderSettings } from './ai-provider-settings';

export interface AIProviderSettingsRepository {
  /** 행이 없으면 빈 설정 */
  load(): AIProviderSettings;
  /** 단일 트랜잭션: 설정 UPSERT + 활성 표시 갱신 */
  save(settings: AIProviderSettings): void;
}
