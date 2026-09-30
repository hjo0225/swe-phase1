import { and, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { noteLinks, notes } from '../../platform/db/schema';
import { Note } from '../domain/note';
import { NoteContent } from '../domain/note-content';
import type { LinkedNoteRow, NoteRepository, NoteSearchRow, NoteSummaryRow } from '../domain/note-repository';
import { NoteTitle } from '../domain/note-title';
import type { SearchQuery } from '../domain/search-query';

const SUMMARY_HEAD_LENGTH = 300;

export class DrizzleNoteRepository implements NoteRepository {
  constructor(private readonly db: BetterSQLite3Database) {}

  findById(id: string): Note | null {
    const row = this.db.select().from(notes).where(eq(notes.id, id)).get();
    if (!row) return null;
    const links = this.db
      .select({ targetNoteId: noteLinks.targetNoteId })
      .from(noteLinks)
      .where(eq(noteLinks.sourceNoteId, id))
      .all();
    return Note.restore({
      id: row.id,
      title: NoteTitle.of(row.title),
      content: NoteContent.restore(row.contentJson, row.plainText),
      linkedNoteIds: new Set(links.map((l) => l.targetNoteId)),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  exists(id: string): boolean {
    return this.db.select({ id: notes.id }).from(notes).where(eq(notes.id, id)).get() !== undefined;
  }

  findExistingIds(ids: ReadonlySet<string>): Set<string> {
    if (ids.size === 0) return new Set();
    const rows = this.db.select({ id: notes.id }).from(notes).where(inArray(notes.id, [...ids])).all();
    return new Set(rows.map((r) => r.id));
  }

  save(note: Note): void {
    const linked = [...note.linkedNoteIds];
    const updatedAt = note.updatedAt.getTime();
    this.db.transaction((tx) => {
      tx.insert(notes)
        .values({
          id: note.id,
          title: note.title.value,
          contentJson: note.content.serialized,
          plainText: note.content.plainText,
          createdAt: note.createdAt.getTime(),
          updatedAt,
        })
        .onConflictDoUpdate({
          target: notes.id,
          set: {
            title: note.title.value,
            contentJson: note.content.serialized,
            plainText: note.content.plainText,
            updatedAt,
          },
        })
        .run();

      const stale = linked.length
        ? and(eq(noteLinks.sourceNoteId, note.id), notInArray(noteLinks.targetNoteId, linked))
        : eq(noteLinks.sourceNoteId, note.id);
      tx.delete(noteLinks).where(stale).run();

      if (linked.length) {
        // 이미 있는 링크는 created_at을 보존한다.
        tx.insert(noteLinks)
          .values(linked.map((targetNoteId) => ({ sourceNoteId: note.id, targetNoteId, createdAt: updatedAt })))
          .onConflictDoNothing()
          .run();
      }
    });
  }

  delete(id: string): void {
    this.db.delete(notes).where(eq(notes.id, id)).run();
  }

  listSummaries(): NoteSummaryRow[] {
    return this.db
      .select({
        id: notes.id,
        title: notes.title,
        plainTextHead: sql<string>`substr(${notes.plainText}, 1, ${SUMMARY_HEAD_LENGTH})`,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .orderBy(desc(notes.updatedAt))
      .all()
      .map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) }));
  }

  search(query: SearchQuery, options: { excludeNoteId?: string; limit: number }): NoteSearchRow[] {
    const patterns = query.keywords.map((keyword) => `%${escapeLike(keyword)}%`);
    if (patterns.length === 0) return [];
    const conditions = patterns.map(
      (p) => sql`(${notes.title} LIKE ${p} ESCAPE '\\' OR ${notes.plainText} LIKE ${p} ESCAPE '\\')`,
    );
    if (options.excludeNoteId) conditions.push(ne(notes.id, options.excludeNoteId));

    return this.db
      .select({ id: notes.id, title: notes.title, plainText: notes.plainText, updatedAt: notes.updatedAt })
      .from(notes)
      .where(and(...conditions))
      .orderBy(sql`(${notes.title} LIKE ${patterns[0]} ESCAPE '\\') DESC`, desc(notes.updatedAt))
      .limit(options.limit)
      .all()
      .map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) }));
  }

  findOutgoingLinks(sourceId: string): LinkedNoteRow[] {
    return this.db
      .select({ noteId: notes.id, title: notes.title })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.targetNoteId))
      .where(eq(noteLinks.sourceNoteId, sourceId))
      .all();
  }

  findIncomingLinks(targetId: string): LinkedNoteRow[] {
    return this.db
      .select({ noteId: notes.id, title: notes.title })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.sourceNoteId))
      .where(eq(noteLinks.targetNoteId, targetId))
      .orderBy(desc(notes.updatedAt))
      .all();
  }
}

/** LIKE의 와일드카드(%, _)와 이스케이프 문자(\)를 문자 그대로 취급하게 한다 (BR-NOTE-06). */
function escapeLike(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (c) => `\\${c}`);
}
