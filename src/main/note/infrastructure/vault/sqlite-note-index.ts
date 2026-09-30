import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { targetKey } from '../../../../shared/notes/wiki-link';
import type { SearchQuery } from '../../domain/search-query';
import { indexedLinks, indexedNotes } from './vault-index-db';

export interface NoteIndexRow {
  id: string;
  path: string;
  plainText: string;
  size: number;
  mtimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteIndexEntry extends NoteIndexRow {
  linkTargets: readonly string[];
}

export interface NoteSearchRow {
  id: string;
  path: string;
  plainText: string;
  updatedAt: Date;
}

export interface NoteIndex {
  findById(id: string): NoteIndexRow | null;
  findByPath(path: string): NoteIndexRow | null;
  all(): NoteIndexRow[];
  upsert(entry: NoteIndexEntry): void;
  remove(id: string): void;
  movePath(id: string, path: string): void;
  search(query: SearchQuery, options: { excludeNoteId?: string; limit: number }): NoteSearchRow[];
  linkTargetsOf(id: string): string[];
  sourcesLinkingTo(keys: readonly string[]): string[];
}

const titleOf = (path: string) => path.split('/').pop()!.replace(/\.md$/i, '');
type Row = typeof indexedNotes.$inferSelect;
const toRow = (row: Row): NoteIndexRow => ({
  id: row.id,
  path: row.path,
  plainText: row.plainText,
  size: row.size,
  mtimeMs: row.mtimeMs,
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
});

/** 보관함 색인 (docs/backend/note/persistence.md). 제목은 경로에서 파생해 검색·정렬용으로만 저장한다. */
export class SqliteNoteIndex implements NoteIndex {
  constructor(private readonly db: BetterSQLite3Database) {}

  findById(id: string): NoteIndexRow | null {
    const row = this.db.select().from(indexedNotes).where(eq(indexedNotes.id, id)).get();
    return row ? toRow(row) : null;
  }

  findByPath(path: string): NoteIndexRow | null {
    // path 컬럼이 COLLATE NOCASE라 대소문자를 무시하고 비교된다.
    const row = this.db.select().from(indexedNotes).where(eq(indexedNotes.path, path)).get();
    return row ? toRow(row) : null;
  }

  all(): NoteIndexRow[] {
    return this.db.select().from(indexedNotes).all().map(toRow);
  }

  upsert(entry: NoteIndexEntry): void {
    const values = {
      path: entry.path,
      title: titleOf(entry.path),
      plainText: entry.plainText,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      createdAt: entry.createdAt.getTime(),
      updatedAt: entry.updatedAt.getTime(),
    };
    const links = new Map<string, string>();
    for (const target of entry.linkTargets) {
      const key = targetKey(target);
      if (key && !links.has(key)) links.set(key, target);
    }
    this.db.transaction((tx) => {
      tx.insert(indexedNotes).values({ id: entry.id, ...values }).onConflictDoUpdate({ target: indexedNotes.id, set: values }).run();
      tx.delete(indexedLinks).where(eq(indexedLinks.sourceId, entry.id)).run();
      if (links.size > 0) {
        tx.insert(indexedLinks)
          .values([...links].map(([key, text]) => ({ sourceId: entry.id, targetKey: key, targetText: text })))
          .run();
      }
    });
  }

  remove(id: string): void {
    this.db.delete(indexedNotes).where(eq(indexedNotes.id, id)).run();
  }

  movePath(id: string, path: string): void {
    this.db.update(indexedNotes).set({ path, title: titleOf(path) }).where(eq(indexedNotes.id, id)).run();
  }

  search(query: SearchQuery, options: { excludeNoteId?: string; limit: number }): NoteSearchRow[] {
    const patterns = query.keywords.map((k) => `%${k.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (patterns.length === 0) return [];
    const conditions = patterns.map(
      (p) => sql`(${indexedNotes.title} LIKE ${p} ESCAPE '\\' OR ${indexedNotes.plainText} LIKE ${p} ESCAPE '\\')`,
    );
    if (options.excludeNoteId) conditions.push(ne(indexedNotes.id, options.excludeNoteId));
    return this.db
      .select({ id: indexedNotes.id, path: indexedNotes.path, plainText: indexedNotes.plainText, updatedAt: indexedNotes.updatedAt })
      .from(indexedNotes)
      .where(and(...conditions))
      .orderBy(sql`(${indexedNotes.title} LIKE ${patterns[0]} ESCAPE '\\') DESC`, desc(indexedNotes.updatedAt))
      .limit(options.limit)
      .all()
      .map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) }));
  }

  linkTargetsOf(id: string): string[] {
    return this.db
      .select({ text: indexedLinks.targetText })
      .from(indexedLinks)
      .where(eq(indexedLinks.sourceId, id))
      .all()
      .map((r) => r.text);
  }

  sourcesLinkingTo(keys: readonly string[]): string[] {
    const normalized = [...new Set(keys.map((k) => k.toLowerCase()))];
    if (normalized.length === 0) return [];
    return this.db
      .selectDistinct({ id: indexedLinks.sourceId })
      .from(indexedLinks)
      .where(inArray(indexedLinks.targetKey, normalized))
      .all()
      .map((r) => r.id);
  }
}
