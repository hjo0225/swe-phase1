import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../platform/db/migrate';
import { migrations } from '../platform/db/migrations';
import { openVaultIndex } from './infrastructure/vault/vault-index-db';

/** 테스트 전용: 앱 설정 DB(blink.db) 마이그레이션이 적용된 in-memory DB. */
export function createTestDatabase() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite, migrations);
  return { sqlite, db: drizzle(sqlite), close: () => sqlite.close() };
}

/** 테스트 전용: 보관함 색인 DB(노트 색인·AI Job). */
export const createTestVaultIndex = () => openVaultIndex(':memory:');

/** 테스트 전용: 색인에 노트 한 줄을 넣는다 (AI Job FK용). */
export function insertIndexedNote(sqlite: BetterSqlite3.Database, id: string, path = `${id}.md`): void {
  sqlite
    .prepare(
      'INSERT INTO notes (id, path, title, plain_text, size, mtime_ms, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, 0)',
    )
    .run(id, path, path.replace(/\.md$/, ''), '');
}
