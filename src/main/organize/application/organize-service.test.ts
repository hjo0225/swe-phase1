import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelCapabilities } from '../../ai-provider/domain/model-capabilities';
import { fakeProvider } from '../../ai-provider/testing';
import { FolderService } from '../../note/application/vault/folder-service';
import { IndexSync } from '../../note/application/vault/index-sync';
import { VaultNoteService } from '../../note/application/vault/vault-note-service';
import { NodeVaultFileSystem } from '../../note/infrastructure/vault/node-vault-file-system';
import { SqliteNoteIndex } from '../../note/infrastructure/vault/sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from '../../note/infrastructure/vault/vault-index-db';
import { DomainError } from '../../platform/errors';
import { OrganizeService } from './organize-service';

const SPRING = ['spring boot 실무 1편', 'spring boot 실무 2편', 'spring boot 실무 3편'];
const RUST = ['rust 소유권 정리', 'rust 소유권 활용', 'rust 소유권 심화'];

let dir: string;
let root: string;
let db: VaultIndexDatabase;
let notes: VaultNoteService;
let sync: IndexSync;
let organize: OrganizeService;
let llmConfigured: boolean;
/** 가짜 AI: 묶음 줄에 spring이 있으면 Spring, rust면 Rust */
const namer = vi.fn(async ({ user }: { user: string }) => ({
  names: user
    .split('\n')
    .filter((line) => line.startsWith('묶음 '))
    .map((line, i) => (line.includes('spring') ? 'Spring' : line.includes('rust') ? 'Rust' : `기타${i + 1}`)),
}));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blink-organize-'));
  root = join(dir, 'vault');
  mkdirSync(root);
  db = openVaultIndex(':memory:');
  let seq = 0;
  const deps = {
    fs: new NodeVaultFileSystem(root),
    index: new SqliteNoteIndex(db.db),
    clock: { now: () => new Date(0) },
    nextId: () => `id-${++seq}`,
  };
  notes = new VaultNoteService(deps);
  const folders = new FolderService(deps);
  sync = new IndexSync(deps);
  namer.mockClear();
  llmConfigured = true;
  organize = new OrganizeService({
    notes: () => notes,
    folders: () => folders,
    activeLLM: {
      resolve: () => {
        if (!llmConfigured) throw new DomainError('AI_PROVIDER_NOT_CONFIGURED', 'No usable AI provider is configured');
        return {
          provider: 'openai' as const,
          model: 'test',
          capabilities: new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: false }),
          client: fakeProvider({ generateStructured: namer }),
        };
      },
    },
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 보관함 폴더에 빈 노트 파일을 만들고 색인한다 */
const seed = (folder: string, ...titles: string[]) => {
  const segments = folder.split('/').filter(Boolean);
  mkdirSync(join(root, ...segments), { recursive: true });
  for (const title of titles) writeFileSync(join(root, ...segments, `${title}.md`), '');
  sync.full();
};
const idOf = (title: string, folder = '') => notes.tree().notes.find((n) => n.title === title && n.folder === folder)!.id;
const titlesIn = (folder: string) =>
  notes
    .tree()
    .notes.filter((n) => n.folder === folder)
    .map((n) => n.title)
    .sort();
const codeOf = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return null;
};

describe('preview', () => {
  it('groups two topics into new folders named by the AI, without moving anything yet', async () => {
    seed('', ...SPRING, ...RUST);
    const plan = await organize.preview('');
    expect(plan.skipped).toBeNull();
    expect(plan.moves).toEqual([]);
    const groups = plan.newFolders.map((f) => [f.name, f.notes.map((n) => n.title).sort()]).sort();
    expect(groups).toEqual([
      ['Rust', [...RUST].sort()],
      ['Spring', [...SPRING].sort()],
    ]);
    expect(namer).toHaveBeenCalledTimes(1);
    expect(titlesIn('')).toHaveLength(6);
  });

  it('puts notes that fit an existing subfolder there and the rest into 미분류', async () => {
    seed('Spring', ...SPRING);
    seed('', 'spring boot 실무 4편', '김치찌개 레시피', '스쿼트 자세');
    const plan = await organize.preview('');
    expect(plan.newFolders).toEqual([]);
    expect(plan.moves.map((m) => [m.title, m.to]).sort()).toEqual(
      [
        ['spring boot 실무 4편', 'Spring'],
        ['김치찌개 레시피', '미분류'],
        ['스쿼트 자세', '미분류'],
      ].sort(),
    );
    expect(namer).not.toHaveBeenCalled();
  });

  it('says so when nothing groups clearly', async () => {
    seed('', 'spring boot 실무 1편', '김치찌개 레시피', '스쿼트 자세', '영어 회화 표현', 'rust 소유권 정리', '자료구조 스택');
    await expect(organize.preview('')).resolves.toMatchObject({ newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' });
  });

  it('says so when there are fewer than 3 notes', async () => {
    seed('', 'spring boot 실무 1편', '김치찌개 레시피');
    await expect(organize.preview('')).resolves.toMatchObject({ skipped: 'TOO_FEW_NOTES' });
  });

  it('refuses to classify inside 미분류', async () => {
    seed('미분류', 'a 노트');
    expect(await codeOf(() => organize.preview('미분류'))).toBe('VALIDATION_FAILED');
  });

  it('needs a configured AI only when new folders must be named', async () => {
    llmConfigured = false;
    seed('', ...SPRING, ...RUST);
    expect(await codeOf(() => organize.preview(''))).toBe('AI_PROVIDER_NOT_CONFIGURED');
  });
});

describe('apply', () => {
  it('creates the folders and moves the notes as previewed', async () => {
    seed('', ...SPRING, ...RUST);
    const result = organize.apply(await organize.preview(''));
    expect(result.createdFolders.sort()).toEqual(['Rust', 'Spring']);
    expect(result.movedNotes).toBe(6);
    expect(titlesIn('Spring')).toEqual([...SPRING].sort());
    expect(titlesIn('Rust')).toEqual([...RUST].sort());
  });

  it('creates 미분류 when needed and skips notes deleted after the preview', async () => {
    seed('Spring', ...SPRING);
    seed('', 'spring boot 실무 4편', '김치찌개 레시피', '스쿼트 자세');
    const plan = await organize.preview('');
    notes.delete(idOf('스쿼트 자세'));
    expect(organize.apply(plan)).toMatchObject({ movedNotes: 2, createdFolders: ['미분류'] });
    expect(titlesIn('미분류')).toEqual(['김치찌개 레시피']);
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });
});

describe('place', () => {
  beforeEach(() => {
    seed('Spring', ...SPRING);
    seed('Rust', 'rust 소유권 정리', 'rust 소유권 활용');
  });

  it('moves a new note into the subfolder it fits', () => {
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('Spring');
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });

  it('sends a note that fits nowhere to 미분류 of that level', () => {
    seed('', '김치찌개 레시피');
    expect(organize.place(idOf('김치찌개 레시피')).folder).toBe('미분류');
  });

  it('numbers the title when the target folder already has it', () => {
    seed('', 'spring boot 실무 1편');
    expect(organize.place(idOf('spring boot 실무 1편', '')).folder).toBe('Spring');
    expect(titlesIn('Spring')).toContain('spring boot 실무 1편 (2)');
  });

  it('works without an AI', () => {
    llmConfigured = false;
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('Spring');
  });
});

describe('place across levels', () => {
  it('goes down several levels', () => {
    seed('공부/Spring', ...SPRING);
    seed('공부/Rust', ...RUST);
    seed('요리', '김치찌개 레시피', '된장찌개 레시피', '부대찌개 레시피');
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('공부/Spring');
  });

  it('starts from the folder the note was created in', () => {
    seed('공부/Spring', ...SPRING);
    seed('공부/Rust', ...RUST);
    seed('공부', 'rust 소유권 입문');
    expect(organize.place(idOf('rust 소유권 입문', '공부')).folder).toBe('공부/Rust');
  });

  it('leaves the note where it is when the folder has no subfolders', () => {
    seed('', ...RUST, 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편'))).toEqual({ folder: '', updatedNoteIds: [] });
  });
});

describe('speed', () => {
  it('previews 30 loose notes against a 200-note subfolder within 3 seconds', async () => {
    const topics = ['spring boot 실무', 'rust 소유권', '김치찌개 레시피', '영어 회화', '자료구조'];
    seed('공부', ...Array.from({ length: 200 }, (_, i) => `${topics[i % 5]} ${i}편`));
    seed('', ...Array.from({ length: 30 }, (_, i) => `${topics[i % 5]} 새 노트 ${i}`));
    const start = performance.now();
    await organize.preview('');
    expect(performance.now() - start).toBeLessThan(3000);
  }, 60_000);
});

describe('importFile', () => {
  it('brings an outside .md in and places it', () => {
    seed('Spring', ...SPRING);
    const source = join(dir, 'spring boot 실무 4편.md');
    writeFileSync(source, '# 4편');
    expect(organize.importFile({ sourcePath: source, folder: '' }).folder).toBe('Spring');
    expect(existsSync(source)).toBe(false);
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });
});
