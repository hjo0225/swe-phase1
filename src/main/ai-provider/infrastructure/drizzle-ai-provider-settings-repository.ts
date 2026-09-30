import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ProviderId } from '../../../shared/ipc/ai-provider';
import { aiProviderSettings } from '../../platform/db/schema';
import { AIProviderSettings } from '../domain/ai-provider-settings';
import type { AIProviderSettingsRepository } from '../domain/ai-provider-settings-repository';

export class DrizzleAIProviderSettingsRepository implements AIProviderSettingsRepository {
  constructor(private readonly db: BetterSQLite3Database) {}

  load(): AIProviderSettings {
    const rows = this.db.select().from(aiProviderSettings).all();
    return AIProviderSettings.restore(
      rows.map((row) => ({
        provider: row.provider as ProviderId,
        model: row.model,
        baseUrl: row.baseUrl,
        apiKey: row.encryptedApiKey ? new Uint8Array(row.encryptedApiKey) : null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      })),
      (rows.find((row) => row.isActive === 1)?.provider as ProviderId | undefined) ?? null,
    );
  }

  save(settings: AIProviderSettings): void {
    const active = settings.activeProviderId;
    this.db.transaction((tx) => {
      // 부분 유니크 인덱스(활성 1개) 위반을 피하려고 먼저 모두 비활성화한다.
      tx.update(aiProviderSettings).set({ isActive: 0 }).run();
      for (const entry of settings.all()) {
        const values = {
          model: entry.model,
          baseUrl: entry.baseUrl,
          encryptedApiKey: entry.apiKey ? Buffer.from(entry.apiKey) : null,
          isActive: entry.provider === active ? 1 : 0,
          updatedAt: entry.updatedAt.getTime(),
        };
        tx.insert(aiProviderSettings)
          .values({ provider: entry.provider, createdAt: entry.createdAt.getTime(), ...values })
          .onConflictDoUpdate({ target: aiProviderSettings.provider, set: values })
          .run();
      }
    });
  }
}
