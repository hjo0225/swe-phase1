import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export interface AppConfig {
  lastVault: string | null;
  recentVaults: { root: string; openedAt: string }[];
}

export interface AppConfigStore {
  load(): AppConfig;
  save(config: AppConfig): void;
}

const EMPTY: AppConfig = { lastVault: null, recentVaults: [] };

/** userData/app-config.json — 마지막·최근 보관함. 파일이 없거나 깨졌으면 빈 설정으로 시작한다(파일은 건드리지 않는다). */
export class JsonAppConfigStore implements AppConfigStore {
  constructor(private readonly file: string) {}

  load(): AppConfig {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppConfig>;
      return {
        lastVault: typeof parsed.lastVault === 'string' ? parsed.lastVault : null,
        recentVaults: Array.isArray(parsed.recentVaults)
          ? parsed.recentVaults.filter(
              (v): v is AppConfig['recentVaults'][number] => typeof v?.root === 'string' && typeof v.openedAt === 'string',
            )
          : [],
      };
    } catch {
      return { ...EMPTY, recentVaults: [] };
    }
  }

  save(config: AppConfig): void {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8');
    renameSync(temp, this.file);
  }
}
