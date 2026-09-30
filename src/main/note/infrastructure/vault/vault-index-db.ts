import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { runMigrations, type Migration } from '../../../platform/db/migrate';

/**
 * 보관함 색인 DB (D-17: userData/vaults/<해시>.db). 파일에서 다시 만들 수 있다(AI Job 제외).
 * 앱 설정 DB(blink.db)와 마이그레이션 목록을 따로 둔다.
 */
export const vaultMigrations: readonly Migration[] = [
  {
    id: '0001_vault_index',
    sql: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        title TEXT NOT NULL,
        plain_text TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notes_updated_at ON notes (updated_at DESC);

      CREATE TABLE note_links (
        source_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        target_key TEXT NOT NULL,
        target_text TEXT NOT NULL,
        PRIMARY KEY (source_id, target_key)
      );
      CREATE INDEX idx_note_links_key ON note_links (target_key);

      CREATE TABLE ai_jobs (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('EXPAND', 'ORGANIZE', 'VISUALIZE')),
        status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
        input_text TEXT NOT NULL,
        result_kind TEXT,
        result_text TEXT,
        result_data TEXT,
        failure_code TEXT,
        failure_message TEXT,
        provider TEXT,
        model TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX idx_ai_jobs_note ON ai_jobs (note_id, created_at DESC);
      CREATE INDEX idx_ai_jobs_status ON ai_jobs (status);
    `,
  },
];

export const indexedNotes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  path: text('path').notNull(),
  title: text('title').notNull(),
  plainText: text('plain_text').notNull(),
  size: integer('size').notNull(),
  mtimeMs: integer('mtime_ms').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const indexedLinks = sqliteTable(
  'note_links',
  {
    sourceId: text('source_id').notNull(),
    targetKey: text('target_key').notNull(),
    targetText: text('target_text').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.targetKey] })],
);

export interface VaultIndexDatabase {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database;
  close(): void;
}

export function openVaultIndex(filename: string): VaultIndexDatabase {
  const sqlite = new BetterSqlite3(filename);
  if (filename !== ':memory:') sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite, vaultMigrations);
  return { sqlite, db: drizzle(sqlite), close: () => sqlite.close() };
}
