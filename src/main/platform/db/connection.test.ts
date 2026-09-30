import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './connection';

describe('openDatabase', () => {
  let dir: string;
  let database: Database | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blink-db-'));
  });

  afterEach(() => {
    database?.close();
    database = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it('enables foreign keys and WAL on a file database', () => {
    database = openDatabase(join(dir, 'blink.db'));
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('enforces foreign key constraints', () => {
    database = openDatabase(join(dir, 'blink.db'));
    database.sqlite.exec('CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (pid TEXT REFERENCES p(id));');
    const insertOrphan = database.sqlite.prepare("INSERT INTO c VALUES ('missing')");
    expect(() => insertOrphan.run()).toThrow(/FOREIGN KEY/);
  });
});
