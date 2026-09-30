import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Note } from '../domain/note';
import { NoteContent } from '../domain/note-content';
import { NoteTitle } from '../domain/note-title';
import { createTestDatabase, linkNode, noteDoc, textNode } from '../testing';
import { DrizzleNoteRepository } from './drizzle-note-repository';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 0, minute));

describe('DrizzleNoteRepository', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let repo: DrizzleNoteRepository;

  beforeEach(() => {
    database = createTestDatabase();
    repo = new DrizzleNoteRepository(database.db);
  });
  afterEach(() => database.close());

  const note = (id: string, title: string, minute: number, ...links: string[]) => {
    const n = Note.create({
      id,
      title: NoteTitle.of(title),
      content: NoteContent.from(noteDoc([textNode(`${title} 본문`), ...links.map((l) => linkNode(l))])),
      now: at(minute),
    });
    n.resolveLinks(new Set(links));
    return n;
  };

  it('round-trips a note with its links', () => {
    repo.save(note(B, 'B', 0));
    repo.save(note(A, 'A', 1, B));

    const loaded = repo.findById(A);
    expect(loaded?.title.value).toBe('A');
    expect(loaded?.content.plainText).toBe('A 본문link');
    expect(loaded?.linkedNoteIds).toEqual(new Set([B]));
    expect(loaded?.updatedAt).toEqual(at(1));
    expect(repo.findById(C)).toBeNull();
  });

  it('replaces the link set on save', () => {
    repo.save(note(B, 'B', 0));
    repo.save(note(C, 'C', 0));
    repo.save(note(A, 'A', 1, B));
    repo.save(note(A, 'A', 2, C));
    expect(repo.findById(A)?.linkedNoteIds).toEqual(new Set([C]));
  });

  it('reports which ids exist', () => {
    repo.save(note(A, 'A', 0));
    expect(repo.exists(A)).toBe(true);
    expect(repo.exists(B)).toBe(false);
    expect(repo.findExistingIds(new Set([A, B]))).toEqual(new Set([A]));
    expect(repo.findExistingIds(new Set())).toEqual(new Set());
  });

  it('deletes a note and cascades its links', () => {
    repo.save(note(B, 'B', 0));
    repo.save(note(A, 'A', 1, B));
    repo.delete(B);
    expect(repo.findById(B)).toBeNull();
    expect(repo.findById(A)?.linkedNoteIds).toEqual(new Set());
    expect(() => repo.delete(B)).not.toThrow();
  });

  it('lists summaries by most recent update', () => {
    repo.save(note(A, 'A', 0));
    repo.save(note(B, 'B', 5));
    repo.save(note(C, '', 3));
    const rows = repo.listSummaries();
    expect(rows.map((r) => r.id)).toEqual([B, C, A]);
    expect(rows[0]).toMatchObject({ title: 'B', plainTextHead: 'B 본문', updatedAt: at(5) });
  });
});
