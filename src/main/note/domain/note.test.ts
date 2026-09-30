import { describe, expect, it } from 'vitest';
import { Note } from './note';
import { NoteContent } from './note-content';
import { NoteTitle } from './note-title';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const t0 = new Date('2026-09-30T00:00:00Z');
const t1 = new Date('2026-09-30T00:01:00Z');

const docWith = (...texts: string[]) =>
  NoteContent.from({ type: 'doc', content: texts.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const docLinking = (...ids: string[]) =>
  NoteContent.from({
    type: 'doc',
    content: [{ type: 'paragraph', content: ids.map((noteId) => ({ type: 'noteLink', attrs: { noteId, label: 'x' } })) }],
  });

describe('NoteTitle', () => {
  it('trims and allows empty titles with a display fallback', () => {
    expect(NoteTitle.of('  회의  ').value).toBe('회의');
    expect(NoteTitle.of('   ').display()).toBe('제목 없음');
  });

  it('rejects titles over 200 characters', () => {
    expect(() => NoteTitle.of('a'.repeat(201))).toThrow(expect.objectContaining({ code: 'NOTE_TITLE_TOO_LONG' }));
    expect(NoteTitle.of('a'.repeat(200)).value).toHaveLength(200);
  });
});

describe('Note', () => {
  const create = () => Note.create({ id: A, title: NoteTitle.of('제목'), content: docWith('본문'), now: t0 });

  it('starts with createdAt = updatedAt', () => {
    const note = create();
    expect(note.createdAt).toEqual(t0);
    expect(note.updatedAt).toEqual(t0);
  });

  it('touches updatedAt only when title or content really changes', () => {
    const note = create();
    expect(note.rename(NoteTitle.of('제목'), t1)).toBe(false);
    expect(note.replaceContent(docWith('본문'), t1)).toBe(false);
    expect(note.updatedAt).toEqual(t0);

    expect(note.rename(NoteTitle.of('새 제목'), t1)).toBe(true);
    expect(note.updatedAt).toEqual(t1);
  });

  it('resolves links to existing notes only and never to itself', () => {
    const note = Note.create({ id: A, title: NoteTitle.of(''), content: docLinking(A, B, C), now: t0 });
    expect(note.referencedNoteIds).toEqual(new Set([A, B, C]));
    note.resolveLinks(new Set([A, B]));
    expect(note.linkedNoteIds).toEqual(new Set([B]));
  });

  it('builds a whitespace-normalized preview of at most 120 characters', () => {
    const note = Note.create({ id: A, title: NoteTitle.of(''), content: docWith('첫 줄', '둘째   줄', 'x'.repeat(200)), now: t0 });
    expect(note.preview()).toHaveLength(120);
    expect(note.preview().startsWith('첫 줄 둘째 줄 xxx')).toBe(true);
  });
});
