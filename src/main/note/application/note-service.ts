import type {
  CreateNoteInput,
  NoteDetail,
  NoteLinks,
  NoteSearchHit,
  NoteSummary,
  SearchNotesInput,
  UpdateNoteInput,
  UpdateNoteResult,
} from '../../../shared/ipc/notes';
import type { Clock, IdGenerator } from '../../platform/clock';
import { DomainError } from '../../platform/errors';
import { Note, previewOf, snippetOf } from '../domain/note';
import { NoteContent } from '../domain/note-content';
import type { NoteRepository } from '../domain/note-repository';
import { NoteTitle } from '../domain/note-title';
import { SearchQuery } from '../domain/search-query';

const DEFAULT_SEARCH_LIMIT = 20;

/** note 유스케이스 (docs/backend/note/application-flows.md). 응집된 작은 도메인이라 서비스 하나로 둔다. */
export class NoteService {
  constructor(
    private readonly repo: NoteRepository,
    private readonly clock: Clock,
    private readonly nextId: IdGenerator,
  ) {}

  create(input: CreateNoteInput): NoteDetail {
    const note = Note.create({
      id: this.nextId(),
      title: NoteTitle.of(input.title ?? ''),
      content: input.content ? NoteContent.from(input.content) : NoteContent.empty(),
      now: this.clock.now(),
    });
    note.resolveLinks(this.repo.findExistingIds(note.referencedNoteIds));
    this.repo.save(note);
    return toDetail(note);
  }

  list(): { items: NoteSummary[] } {
    return {
      items: this.repo.listSummaries().map((row) => ({
        id: row.id,
        title: NoteTitle.of(row.title).display(),
        preview: previewOf(row.plainTextHead),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  get(id: string): NoteDetail {
    return toDetail(this.load(id));
  }

  update(input: UpdateNoteInput): UpdateNoteResult {
    const note = this.load(input.id);
    const now = this.clock.now();
    let changed = false;
    if (input.title !== undefined) changed = note.rename(NoteTitle.of(input.title), now) || changed;
    if (input.content !== undefined) changed = note.replaceContent(NoteContent.from(input.content), now) || changed;

    if (changed) {
      note.resolveLinks(this.repo.findExistingIds(note.referencedNoteIds));
      this.repo.save(note);
    }
    return { id: note.id, updatedAt: note.updatedAt.toISOString(), changed };
  }

  search(input: SearchNotesInput): { items: NoteSearchHit[] } {
    const query = SearchQuery.parse(input.query);
    if (query.isEmpty()) return { items: [] };
    const rows = this.repo.search(query, {
      excludeNoteId: input.excludeNoteId,
      limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: NoteTitle.of(row.title).display(),
        snippet: snippetOf(row.plainText, query.keywords),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  listLinks(noteId: string): NoteLinks {
    if (!this.repo.exists(noteId)) throw new DomainError('NOTE_NOT_FOUND', `Note ${noteId} not found`);
    const display = (row: { noteId: string; title: string }) => ({ noteId: row.noteId, title: NoteTitle.of(row.title).display() });
    return {
      outgoing: this.repo.findOutgoingLinks(noteId).map(display),
      incoming: this.repo.findIncomingLinks(noteId).map(display),
    };
  }

  delete(id: string): { deleted: true } {
    this.repo.delete(id);
    return { deleted: true };
  }

  /** 타 도메인 공개 조회 (NoteQueries). */
  exists(id: string): boolean {
    return this.repo.exists(id);
  }

  private load(id: string): Note {
    const note = this.repo.findById(id);
    if (!note) throw new DomainError('NOTE_NOT_FOUND', `Note ${id} not found`);
    return note;
  }
}

export type NoteQueries = Pick<NoteService, 'exists'>;

function toDetail(note: Note): NoteDetail {
  return {
    id: note.id,
    title: note.title.value,
    content: note.content.doc,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
