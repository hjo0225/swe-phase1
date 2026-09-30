import type BetterSqlite3 from 'better-sqlite3';

export interface Migration {
  /** 정렬 순서가 적용 순서다. 예: `0001_notes` */
  id: string;
  sql: string;
}

/** 아직 적용하지 않은 마이그레이션을 id 순서로, 각각 하나의 트랜잭션으로 적용한다. 적용한 id 목록을 반환한다. */
export function runMigrations(sqlite: BetterSqlite3.Database, migrations: readonly Migration[]): string[] {
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(sqlite.prepare('SELECT id FROM schema_migrations').pluck().all() as string[]);
  const record = sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  const pending = [...migrations].filter((m) => !applied.has(m.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const migration of pending) {
    sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      record.run(migration.id, Date.now());
    })();
  }
  return pending.map((m) => m.id);
}
