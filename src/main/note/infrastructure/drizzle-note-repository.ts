import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { noteLinks, notes } from '../../platform/db/schema';
import { Note } from '../domain/note';
import { NoteContent } from '../domain/note-content';
import type { NoteRepository, NoteSummaryRow } from '../domain/note-repository';
import { NoteTitle } from '../domain/note-title';

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
}
