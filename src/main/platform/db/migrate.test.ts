import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrations } from './migrations';
import { runMigrations, type Migration } from './migrate';

describe('runMigrations', () => {
  let sqlite: BetterSqlite3.Database;

  beforeEach(() => {
    sqlite = new BetterSqlite3(':memory:');
    sqlite.pragma('foreign_keys = ON');
  });

  afterEach(() => sqlite.close());

  const sample: Migration[] = [
    { id: '0001_a', sql: 'CREATE TABLE a (id TEXT PRIMARY KEY);' },
    { id: '0002_b', sql: 'CREATE TABLE b (id TEXT PRIMARY KEY);' },
  ];

  it('applies pending migrations in order and records them', () => {
    expect(runMigrations(sqlite, sample)).toEqual(['0001_a', '0002_b']);
    const applied = sqlite.prepare('SELECT id FROM schema_migrations ORDER BY id').pluck().all();
    expect(applied).toEqual(['0001_a', '0002_b']);
  });

  it('is idempotent', () => {
    runMigrations(sqlite, sample);
    expect(runMigrations(sqlite, sample)).toEqual([]);
  });

  it('rolls back a failing migration without recording it', () => {
    const broken: Migration[] = [{ id: '0001_x', sql: 'CREATE TABLE x (id TEXT); SELECT * FROM missing_table;' }];
    expect(() => runMigrations(sqlite, broken)).toThrow();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'x'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(0);
  });

  describe('app migrations', () => {
    beforeEach(() => runMigrations(sqlite, migrations));

    const insertNote = (id: string) =>
      sqlite
        .prepare("INSERT INTO notes (id, title, content_json, plain_text, created_at, updated_at) VALUES (?, '', '{}', '', 0, 0)")
        .run(id);

    it('cascades note deletion to links in both directions', () => {
      insertNote('a');
      insertNote('b');
      sqlite.prepare("INSERT INTO note_links VALUES ('a', 'b', 0), ('b', 'a', 0)").run();
      sqlite.prepare("DELETE FROM notes WHERE id = 'a'").run();
      expect(sqlite.prepare('SELECT count(*) FROM note_links').pluck().get()).toBe(0);
    });

    it('rejects self links', () => {
      insertNote('a');
      expect(() => sqlite.prepare("INSERT INTO note_links VALUES ('a', 'a', 0)").run()).toThrow(/CHECK/);
    });
  });
});
