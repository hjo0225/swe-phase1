import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeVaultFileSystem } from '../../infrastructure/vault/node-vault-file-system';
import { SqliteNoteIndex } from '../../infrastructure/vault/sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from '../../infrastructure/vault/vault-index-db';
import { FolderService } from './folder-service';
import { IndexSync } from './index-sync';
import { VaultNoteService } from './vault-note-service';

let root: string;
let db: VaultIndexDatabase;
let notes: VaultNoteService;
let folders: FolderService;
let sync: IndexSync;
let seq = 0;

const file = (path: string) => join(root, ...path.split('/'));
const put = (path: string, text: string) => {
  mkdirSync(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(file(path), text);
};
const read = (path: string) => readFileSync(file(path), 'utf8');
const idOf = (path: string) => notes.tree().notes.find((n) => n.path === path)!.id;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blink-vault-app-'));
  db = openVaultIndex(':memory:');
  const fs = new NodeVaultFileSystem(root);
  const index = new SqliteNoteIndex(db.db);
  const deps = { fs, index, clock: { now: () => new Date(Date.UTC(2026, 8, 30)) }, nextId: () => `id-${++seq}` };
  sync = new IndexSync(deps);
  notes = new VaultNoteService(deps);
  folders = new FolderService(deps);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe('IndexSync', () => {
  it('indexes existing files, keeps ids for unchanged files, and follows edits and deletions', () => {
    put('회의록.md', '# 회의\nElectron 사용');
    put('.obsidian/x.md', 'hidden');
    const first = sync.full();
    expect(first.structure).toBe(true);
    const id = idOf('회의록.md');
    expect(notes.tree().notes).toHaveLength(1);

    expect(sync.full()).toEqual({ noteIds: [], structure: false });
    expect(idOf('회의록.md')).toBe(id);

    put('회의록.md', '# 회의\nSQLite로 바꿈');
    utimesSync(file('회의록.md'), new Date(), new Date(Date.now() + 5000));
    expect(sync.paths(['회의록.md']).noteIds).toEqual([id]);
    expect(notes.search({ query: 'sqlite' }).items.map((h) => h.id)).toEqual([id]);

    rmSync(file('회의록.md'));
    expect(sync.paths(['회의록.md'])).toEqual({ noteIds: [id], structure: true });
    expect(notes.tree().notes).toEqual([]);
  });
});

describe('VaultNoteService', () => {
  it('creates uniquely named empty notes inside a folder', () => {
    folders.create({ name: '프로젝트' });
    const a = notes.create({ folder: '프로젝트' });
    const b = notes.create({ folder: '프로젝트' });
    expect([a.path, b.path]).toEqual(['프로젝트/제목 없음.md', '프로젝트/제목 없음 1.md']);
    expect(a).toMatchObject({ title: '제목 없음', content: '' });
    expect(existsSync(file('프로젝트/제목 없음 1.md'))).toBe(true);
    expect(() => notes.create({ folder: '없는 폴더' })).toThrow(expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }));
  });

  it('saves markdown to the file and skips identical content', () => {
    const { id } = notes.create({});
    expect(notes.update({ id, content: '# 제목\n본문 [[다른 노트]]' }).changed).toBe(true);
    expect(read('제목 없음.md')).toBe('# 제목\n본문 [[다른 노트]]');
    expect(notes.update({ id, content: '# 제목\n본문 [[다른 노트]]' }).changed).toBe(false);
    expect(notes.get(id).content).toBe('# 제목\n본문 [[다른 노트]]');
  });

  it('renames the file and fixes links that pointed to it', () => {
    put('회의록.md', '결정 사항');
    put('일지.md', '어제 [[회의록]] 과 [[회의록|지난 회의]] 참고, [[다른 것]]');
    sync.full();
    const id = idOf('회의록.md');

    const result = notes.rename({ id, title: '2026 회의록' });
    expect(result.note).toMatchObject({ id, title: '2026 회의록', path: '2026 회의록.md' });
    expect(existsSync(file('회의록.md'))).toBe(false);
    expect(read('일지.md')).toBe('어제 [[2026 회의록]] 과 [[2026 회의록|지난 회의]] 참고, [[다른 것]]');
    expect(result.updatedNoteIds).toEqual([idOf('일지.md')]);
  });

  it('rejects invalid or taken names', () => {
    put('a.md', '');
    put('b.md', '');
    sync.full();
    expect(() => notes.rename({ id: idOf('a.md'), title: 'x/y' })).toThrow(expect.objectContaining({ code: 'NOTE_TITLE_INVALID' }));
    expect(() => notes.rename({ id: idOf('a.md'), title: 'B' })).toThrow(expect.objectContaining({ code: 'NOTE_TITLE_TAKEN' }));
  });

  it('moves a note into a folder, keeping its id and fixing path-style links', () => {
    put('노트.md', '');
    put('프로젝트/노트.md', '');
    put('참조.md', '[[프로젝트/노트]] 와 [[노트]]');
    sync.full();
    const id = idOf('프로젝트/노트.md');
    folders.create({ name: '보관' });

    const result = notes.move({ id, folder: '보관' });
    expect(result.note.path).toBe('보관/노트.md');
    expect(idOf('보관/노트.md')).toBe(id);
    expect(read('참조.md')).toBe('[[보관/노트]] 와 [[노트]]');
  });

  it('resolves outgoing links and backlinks by name', () => {
    put('개발/Electron Architecture.md', 'Main과 Renderer');
    put('회의록.md', '관련 내용은 [[Electron Architecture]] 참고, [[없는 노트]]');
    sync.full();
    const arch = idOf('개발/Electron Architecture.md');
    const meeting = idOf('회의록.md');
    expect(notes.listLinks(meeting)).toEqual({ outgoing: [{ noteId: arch, title: 'Electron Architecture' }], incoming: [] });
    expect(notes.listLinks(arch)).toEqual({ outgoing: [], incoming: [{ noteId: meeting, title: '회의록' }] });
  });

  it('drops a note from the index when its file disappeared', () => {
    put('사라질.md', '');
    sync.full();
    const id = idOf('사라질.md');
    rmSync(file('사라질.md'));
    expect(() => notes.get(id)).toThrow(expect.objectContaining({ code: 'NOTE_NOT_FOUND' }));
    expect(notes.tree().notes).toEqual([]);
  });

  it('deletes the file', () => {
    const { id } = notes.create({});
    notes.delete(id);
    expect(existsSync(file('제목 없음.md'))).toBe(false);
    expect(notes.exists(id)).toBe(false);
  });
});

describe('FolderService', () => {
  it('creates nested folders and rejects taken or invalid names', () => {
    expect(folders.create({ name: '프로젝트' })).toEqual({ path: '프로젝트' });
    expect(folders.create({ parent: '프로젝트', name: '2026' })).toEqual({ path: '프로젝트/2026' });
    expect(() => folders.create({ name: '프로젝트' })).toThrow(expect.objectContaining({ code: 'FOLDER_NAME_TAKEN' }));
    expect(() => folders.create({ name: 'a:b' })).toThrow(expect.objectContaining({ code: 'FOLDER_NAME_INVALID' }));
    expect(notes.tree().folders).toEqual(['프로젝트', '프로젝트/2026']);
  });

  it('renames a folder, moving its notes without changing their ids', () => {
    put('프로젝트/계획.md', '');
    put('메모.md', '[[프로젝트/계획]]');
    sync.full();
    const id = idOf('프로젝트/계획.md');
    folders.rename({ path: '프로젝트', name: '2026 프로젝트' });
    expect(idOf('2026 프로젝트/계획.md')).toBe(id);
    expect(read('메모.md')).toBe('[[2026 프로젝트/계획]]');
  });

  it('deletes a folder with its notes', () => {
    put('버릴/a.md', '');
    put('버릴/깊이/b.md', '');
    put('남길.md', '');
    sync.full();
    expect(folders.delete({ path: '버릴' })).toEqual({ deletedNotes: 2 });
    expect(notes.tree().notes.map((n) => n.path)).toEqual(['남길.md']);
    expect(() => folders.delete({ path: '버릴' })).toThrow(expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }));
  });
});
