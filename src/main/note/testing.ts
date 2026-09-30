import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../platform/db/migrate';
import { migrations } from '../platform/db/migrations';

/** 테스트 전용: 마이그레이션이 적용된 in-memory DB. */
export function createTestDatabase() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite, migrations);
  return { sqlite, db: drizzle(sqlite), close: () => sqlite.close() };
}

export const noteDoc = (...paragraphs: unknown[][]) => ({
  type: 'doc' as const,
  content: paragraphs.map((content) => ({ type: 'paragraph', content })),
});
export const textNode = (text: string) => ({ type: 'text', text });
export const linkNode = (noteId: string, label = 'link') => ({ type: 'noteLink', attrs: { noteId, label } });
