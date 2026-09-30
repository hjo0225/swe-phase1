import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export interface Database {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database;
  close(): void;
}

export function openDatabase(filename: string): Database {
  const sqlite = new BetterSqlite3(filename);
  sqlite.pragma('journal_mode = WAL');
  // SQLite 기본값은 OFF라서 연결마다 켜야 ON DELETE CASCADE가 동작한다.
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle(sqlite), close: () => sqlite.close() };
}
