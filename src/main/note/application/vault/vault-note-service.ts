import type {
  CreateNoteInput,
  NoteDetail,
  NoteLinks,
  NoteSearchHit,
  RelocateNoteResult,
  SearchNotesInput,
  UpdateNoteInput,
  UpdateNoteResult,
  VaultTree,
} from '../../../../shared/ipc/notes';
import { resolveLinkTarget } from '../../../../shared/notes/wiki-link';
import { DomainError } from '../../../platform/errors';
import { MarkdownContent } from '../../domain/markdown-content';
import { NoteName, numberedName, uniqueName } from '../../domain/names';
import { snippetOf } from '../../domain/note-text';
import { FolderPath, NotePath } from '../../domain/note-path';
import { SearchQuery } from '../../domain/search-query';
import type { NoteIndexRow } from '../../infrastructure/vault/sqlite-note-index';
import { relinkAfterMoves, targetKeysFor } from './link-maintenance';
import { readEntry, toSummary, type VaultDeps } from './vault-deps';

const NEW_NOTE_NAME = '제목 없음';
const DEFAULT_SEARCH_LIMIT = 20;
const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path, 'ko');

/** 보관함 노트 유스케이스 (docs/backend/note/application-flows.md). 파일이 원본, 색인은 파일을 따라간다. */
export class VaultNoteService {
  constructor(private readonly deps: VaultDeps) {}

  tree(): VaultTree {
    return {
      folders: this.deps.fs.listFolders().sort((a, b) => a.localeCompare(b, 'ko')),
      notes: this.deps.index.all().sort(byPath).map(toSummary),
    };
  }

  create(input: CreateNoteInput): NoteDetail {
    const { fs, index, nextId } = this.deps;
    const folder = FolderPath.of(input.folder ?? '');
    if (!folder.isRoot && !fs.exists(folder.value)) throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder.value} not found`);
    const taken = new Set(
      fs
        .listMarkdownFiles()
        .map((f) => NotePath.of(f.path))
        .filter((p) => p.folder.toLowerCase() === folder.value.toLowerCase())
        .map((p) => p.name),
    );
    const path = NotePath.in(folder, NoteName.of(uniqueName(NEW_NOTE_NAME, taken)));
    fs.createExclusive(path.value, '');
    const entry = readEntry(fs, path.value, nextId())!;
    index.upsert(entry);
    return this.detail(entry, '');
  }

  get(id: string): NoteDetail {
    const row = this.load(id);
    let markdown: string;
    try {
      markdown = this.deps.fs.read(row.path);
    } catch {
      this.deps.index.remove(id); // 파일이 사라졌다 → 색인도 따라간다
      throw new DomainError('NOTE_NOT_FOUND', `Note file ${row.path} not found`);
    }
    return this.detail(row, markdown);
  }

  update(input: UpdateNoteInput): UpdateNoteResult {
    const { fs, index } = this.deps;
    const row = this.load(input.id);
    const content = MarkdownContent.fromMarkdown(input.content);
    let current: string;
    try {
      current = fs.read(row.path);
    } catch {
      index.remove(row.id);
      throw new DomainError('NOTE_NOT_FOUND', `Note file ${row.path} not found`);
    }
    if (current === content.markdown) return { id: row.id, updatedAt: row.updatedAt.toISOString(), changed: false };
    try {
      fs.writeAtomic(row.path, content.markdown);
    } catch {
      throw new DomainError('NOTE_WRITE_FAILED', `Could not write ${row.path}`);
    }
    // 감시 이벤트보다 먼저 색인을 맞춰 두면 자기 변경을 외부 변경으로 보지 않는다.
    const entry = readEntry(fs, row.path, row.id, row)!;
    index.upsert(entry);
    return { id: row.id, updatedAt: entry.updatedAt.toISOString(), changed: true };
  }

  rename(input: { id: string; title: string }): RelocateNoteResult {
    const row = this.load(input.id);
    const next = NotePath.of(row.path).withName(NoteName.of(input.title));
    return this.relocate(row, next.value);
  }

  move(input: { id: string; folder: string }): RelocateNoteResult {
    const row = this.load(input.id);
    const folder = FolderPath.of(input.folder);
    if (!folder.isRoot && !this.deps.fs.exists(folder.value)) {
      throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder.value} not found`);
    }
    return this.relocate(row, NotePath.of(row.path).inFolder(folder).value);
  }

  /** 보관함 밖 `.md` 파일을 폴더로 옮겨 와 노트로 만든다. 같은 이름이 있으면 `이름 (2)`. */
  importFile(input: { sourcePath: string; folder: string }): NoteDetail {
    const { fs, index, nextId } = this.deps;
    const fileName = input.sourcePath.split(/[\\/]/).pop() ?? '';
    const absolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(input.sourcePath);
    if (!absolute || !/\.md$/i.test(fileName)) {
      throw new DomainError('NOTE_IMPORT_INVALID', `Not an importable markdown file: ${fileName}`);
    }
    const folder = FolderPath.of(input.folder);
    if (!folder.isRoot && !fs.exists(folder.value)) throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder.value} not found`);
    const taken = new Set(
      fs
        .listMarkdownFiles()
        .map((f) => NotePath.of(f.path))
        .filter((p) => p.folder.toLowerCase() === folder.value.toLowerCase())
        .map((p) => p.name),
    );
    const path = NotePath.in(folder, NoteName.of(numberedName(fileName.replace(/\.md$/i, ''), taken)));
    try {
      fs.importExternal(input.sourcePath, path.value);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        throw new DomainError('NOTE_IMPORT_LOCKED', `${fileName} is open in another program`);
      }
      throw new DomainError('NOTE_IMPORT_INVALID', `Could not import ${fileName}`);
    }
    // 감시 이벤트보다 먼저 색인을 맞춰 두면 자기 변경을 외부 변경으로 보지 않는다.
    const entry = readEntry(fs, path.value, nextId())!;
    index.upsert(entry);
    return this.detail(entry, fs.read(path.value));
  }

  delete(id: string): { deleted: true } {
    const row = this.deps.index.findById(id);
    if (row) {
      if (this.deps.fs.exists(row.path)) this.deps.fs.remove(row.path);
      this.deps.index.remove(id);
    }
    return { deleted: true };
  }

  search(input: SearchNotesInput): { items: NoteSearchHit[] } {
    const query = SearchQuery.parse(input.query);
    if (query.isEmpty()) return { items: [] };
    const rows = this.deps.index.search(query, {
      excludeNoteId: input.excludeNoteId,
      limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: NotePath.of(row.path).name,
        path: row.path,
        snippet: snippetOf(row.plainText, query.keywords),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  listLinks(noteId: string): NoteLinks {
    const { index } = this.deps;
    const row = this.load(noteId);
    const all = index.all();
    const linked = (id: string) => ({ noteId: id, title: NotePath.of(all.find((n) => n.id === id)!.path).name });

    const outgoing = new Set<string>();
    for (const target of index.linkTargetsOf(noteId)) {
      const resolved = resolveLinkTarget(target, all);
      if (resolved && resolved.id !== noteId) outgoing.add(resolved.id);
    }
    const incoming = index
      .sourcesLinkingTo(targetKeysFor(row.path))
      .filter((sourceId) => sourceId !== noteId)
      .filter((sourceId) => index.linkTargetsOf(sourceId).some((t) => resolveLinkTarget(t, all)?.id === noteId));
    return { outgoing: [...outgoing].map(linked), incoming: incoming.map(linked) };
  }

  /** 타 도메인 공개 조회 (NoteQueries). */
  exists(id: string): boolean {
    return this.deps.index.findById(id) !== null;
  }

  private relocate(row: NoteIndexRow, nextPath: string): RelocateNoteResult {
    const { fs, index } = this.deps;
    if (nextPath === row.path) return { note: toSummary(row), updatedNoteIds: [] };
    const caseOnly = nextPath.toLowerCase() === row.path.toLowerCase();
    if (!caseOnly && (index.findByPath(nextPath) || fs.exists(nextPath))) {
      throw new DomainError('NOTE_TITLE_TAKEN', `${nextPath} already exists`);
    }
    const before = index.all();
    fs.rename(row.path, nextPath);
    index.movePath(row.id, nextPath);
    const updatedNoteIds = relinkAfterMoves(this.deps, before, new Map([[row.id, nextPath]]));
    return { note: toSummary(index.findById(row.id)!), updatedNoteIds };
  }

  private load(id: string): NoteIndexRow {
    const row = this.deps.index.findById(id);
    if (!row) throw new DomainError('NOTE_NOT_FOUND', `Note ${id} not found`);
    return row;
  }

  private detail(row: Pick<NoteIndexRow, 'id' | 'path' | 'createdAt' | 'updatedAt'>, content: string): NoteDetail {
    return {
      id: row.id,
      title: NotePath.of(row.path).name,
      path: row.path,
      content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
