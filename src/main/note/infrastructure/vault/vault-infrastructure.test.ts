import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchQuery } from '../../domain/search-query';
import { JsonAppConfigStore } from './app-config-store';
import { NodeVaultFileSystem } from './node-vault-file-system';
import { openVaultIndex, type VaultIndexDatabase } from './vault-index-db';
import { SqliteNoteIndex } from './sqlite-note-index';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blink-vault-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (path: string, text = '') => {
  mkdirSync(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...path.split('/')), text);
};

describe('NodeVaultFileSystem', () => {
  it('lists markdown notes and folders, skipping hidden folders and other files', () => {
    put('회의록.md', '# a');
    put('프로젝트/계획.md');
    put('프로젝트/그림.png');
    put('.obsidian/workspace.md');
    put('node_modules/x/readme.md');
    mkdirSync(join(root, '빈 폴더'));
    const fs = new NodeVaultFileSystem(root);
    expect(fs.listMarkdownFiles().map((f) => f.path).sort()).toEqual(['프로젝트/계획.md', '회의록.md']);
    expect(fs.listFolders().sort()).toEqual(['빈 폴더', '프로젝트']);
  });

  it('writes atomically, reads back, renames and removes', () => {
    const fs = new NodeVaultFileSystem(root);
    fs.makeFolder('a');
    fs.createExclusive('a/노트.md', '처음');
    expect(() => fs.createExclusive('a/노트.md', '다시')).toThrow();
    fs.writeAtomic('a/노트.md', '두 번째');
    expect(fs.read('a/노트.md')).toBe('두 번째');
    expect(readdirSync(join(root, 'a'))).toEqual(['노트.md']); // 임시 파일이 남지 않는다
    fs.rename('a/노트.md', 'a/새 이름.md');
    expect(fs.exists('a/노트.md')).toBe(false);
    expect(fs.stat('a/새 이름.md')?.size).toBe(new TextEncoder().encode('두 번째').byteLength);
    fs.remove('a/새 이름.md');
    fs.removeFolder('a');
    expect(fs.exists('a')).toBe(false);
  });

  it('refuses paths that escape the vault', () => {
    const fs = new NodeVaultFileSystem(root);
    expect(() => fs.read('../secret.md')).toThrow();
  });

  it('reports changed paths from other apps', async () => {
    const fs = new NodeVaultFileSystem(root);
    const changes: string[][] = [];
    const stop = fs.watch((paths) => changes.push(paths));
    try {
      await new Promise((r) => setTimeout(r, 100));
      put('밖에서 만든 노트.md', 'x');
      await expect.poll(() => changes.flat(), { timeout: 3000 }).toContain('밖에서 만든 노트.md');
    } finally {
      stop();
    }
  });
});

describe('SqliteNoteIndex', () => {
  let db: VaultIndexDatabase;
  let index: SqliteNoteIndex;
  beforeEach(() => {
    db = openVaultIndex(':memory:');
    index = new SqliteNoteIndex(db.db);
  });
  afterEach(() => db.close());

  const entry = (id: string, path: string, plainText = '', linkTargets: string[] = []) => ({
    id,
    path,
    plainText,
    linkTargets,
    size: 1,
    mtimeMs: 1,
    createdAt: new Date(0),
    updatedAt: new Date(1000),
  });

  it('upserts entries and finds them by id or path case-insensitively', () => {
    index.upsert(entry('a', '프로젝트/회의록.md', '본문', ['Electron']));
    expect(index.findById('a')?.path).toBe('프로젝트/회의록.md');
    expect(index.findByPath('프로젝트/회의록.MD')?.id).toBe('a');
    expect(index.linkTargetsOf('a')).toEqual(['Electron']);
    index.upsert(entry('a', '프로젝트/회의록.md', '바뀜', ['Other']));
    expect(index.linkTargetsOf('a')).toEqual(['Other']);
  });

  it('moves paths keeping the id and finds link sources by target key', () => {
    index.upsert(entry('a', 'a.md', '', ['회의록#결정', 'X']));
    index.upsert(entry('b', 'b.md'));
    index.movePath('b', 'folder/회의록.md');
    expect(index.findById('b')?.path).toBe('folder/회의록.md');
    expect(index.sourcesLinkingTo(['회의록'])).toEqual(['a']);
    expect(index.sourcesLinkingTo(['없음'])).toEqual([]);
  });

  it('searches by title (file name) and text', () => {
    index.upsert(entry('a', '개발/Electron Architecture.md', 'Main Process와 Renderer'));
    index.upsert(entry('b', '회의록.md', 'electron 쓸 거 같음'));
    const ids = index.search(SearchQuery.parse('electron'), { limit: 20 }).map((r) => r.id);
    expect(ids).toEqual(['a', 'b']);
    expect(index.search(SearchQuery.parse('개발'), { limit: 20 })).toEqual([]); // 폴더 이름은 제목이 아니다
  });

  it('removes entries with their links and ai jobs', () => {
    index.upsert(entry('a', 'a.md', '', ['b']));
    db.sqlite
      .prepare("INSERT INTO ai_jobs (id, note_id, type, status, input_text, created_at) VALUES ('j', 'a', 'ORGANIZE', 'QUEUED', 'x', 0)")
      .run();
    index.remove('a');
    expect(index.all()).toEqual([]);
    expect(db.sqlite.prepare('SELECT count(*) FROM ai_jobs').pluck().get()).toBe(0);
  });
});

describe('JsonAppConfigStore', () => {
  it('starts empty and remembers the last and recent vaults', () => {
    const store = new JsonAppConfigStore(join(root, 'app-config.json'));
    expect(store.load()).toEqual({ lastVault: null, recentVaults: [] });
    store.save({ lastVault: 'C:/v', recentVaults: [{ root: 'C:/v', openedAt: '2026-09-30T00:00:00.000Z' }] });
    expect(new JsonAppConfigStore(join(root, 'app-config.json')).load().lastVault).toBe('C:/v');
  });

  it('survives a corrupted file', () => {
    writeFileSync(join(root, 'app-config.json'), '{nope');
    expect(new JsonAppConfigStore(join(root, 'app-config.json')).load()).toEqual({ lastVault: null, recentVaults: [] });
    expect(readFileSync(join(root, 'app-config.json'), 'utf8')).toBe('{nope');
  });
});
