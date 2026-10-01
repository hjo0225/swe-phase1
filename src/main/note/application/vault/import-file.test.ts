import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { numberedName } from '../../domain/names';
import { NodeVaultFileSystem } from '../../infrastructure/vault/node-vault-file-system';
import { SqliteNoteIndex } from '../../infrastructure/vault/sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from '../../infrastructure/vault/vault-index-db';
import { VaultNoteService } from './vault-note-service';

let dir: string;
let root: string;
let downloads: string;
let db: VaultIndexDatabase;
let notes: VaultNoteService;
let seq = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blink-import-'));
  root = join(dir, 'vault');
  downloads = join(dir, 'downloads');
  mkdirSync(root);
  mkdirSync(downloads);
  db = openVaultIndex(':memory:');
  notes = new VaultNoteService({
    fs: new NodeVaultFileSystem(root),
    index: new SqliteNoteIndex(db.db),
    clock: { now: () => new Date(0) },
    nextId: () => `id-${++seq}`,
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const download = (name: string, text = '# 내용') => {
  const path = join(downloads, name);
  writeFileSync(path, text);
  return path;
};
const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return null;
};

describe('numberedName', () => {
  it('adds (2), (3)… like Windows copies', () => {
    expect(numberedName('회의', new Set())).toBe('회의');
    expect(numberedName('회의', new Set(['회의']))).toBe('회의 (2)');
    expect(numberedName('회의', new Set(['회의', '회의 (2)']))).toBe('회의 (3)');
  });
});

describe('VaultNoteService.importFile', () => {
  it('moves an outside markdown file into the folder and indexes it', () => {
    mkdirSync(join(root, '공부'));
    const source = download('강의 정리.md');
    const note = notes.importFile({ sourcePath: source, folder: '공부' });
    expect(note).toMatchObject({ title: '강의 정리', path: '공부/강의 정리.md', content: '# 내용' });
    expect(existsSync(source)).toBe(false);
    expect(notes.tree().notes.map((n) => n.path)).toEqual(['공부/강의 정리.md']);
  });

  it('numbers the name when the folder already has it', () => {
    notes.importFile({ sourcePath: download('강의 정리.md'), folder: '' });
    const second = notes.importFile({ sourcePath: download('강의 정리.md', '# 두 번째'), folder: '' });
    expect(second.title).toBe('강의 정리 (2)');
  });

  it.each([
    ['non-markdown', () => download('사진.png')],
    ['missing', () => join(downloads, '없는 파일.md')],
    ['relative-path', () => '강의.md'],
  ])('refuses a %s file', (_case, source) => {
    expect(codeOf(() => notes.importFile({ sourcePath: source(), folder: '' }))).toBe('NOTE_IMPORT_INVALID');
  });

  // 다른 프로그램이 연 파일: 복사는 되지만 원본 지우기가 EBUSY로 실패한다 (테스트에서는 파일을 실제로 잠글 수 없어 지우기만 흉내 낸다)
  it('leaves no copy in the vault when the source is locked', () => {
    const fs = new NodeVaultFileSystem(root);
    const locked: NodeVaultFileSystem = Object.assign(Object.create(fs) as NodeVaultFileSystem, {
      removeExternal: () => {
        throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
      },
    });
    const lockedNotes = new VaultNoteService({
      fs: locked,
      index: new SqliteNoteIndex(db.db),
      clock: { now: () => new Date(0) },
      nextId: () => `id-${++seq}`,
    });
    const source = download('잠긴 노트.md');
    expect(codeOf(() => lockedNotes.importFile({ sourcePath: source, folder: '' }))).toBe('NOTE_IMPORT_LOCKED');
    expect(existsSync(source)).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });

  it('keeps the source and leaves no copy when the file is too large', () => {
    const source = download('큰 노트.md', 'a'.repeat(2 * 1024 * 1024 + 1));
    expect(codeOf(() => notes.importFile({ sourcePath: source, folder: '' }))).toBe('NOTE_CONTENT_TOO_LARGE');
    expect(existsSync(source)).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });
});
