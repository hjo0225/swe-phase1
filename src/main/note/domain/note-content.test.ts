import { describe, expect, it } from 'vitest';
import { DomainError } from '../../platform/errors';
import { NoteContent } from './note-content';

const B = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';

const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });
const link = (noteId: string, label: string) => ({ type: 'noteLink', attrs: { noteId, label } });

describe('NoteContent', () => {
  it('derives plain text with one line per block', () => {
    const content = NoteContent.from({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('회의 결과')] },
        paragraph(text('Electron'), { type: 'hardBreak' }, text('SQLite')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('다음 주 MVP'))] }] },
      ],
    });
    expect(content.plainText).toBe('회의 결과\nElectron\nSQLite\n다음 주 MVP');
  });

  it('uses link labels as text and collects referenced note ids', () => {
    const content = NoteContent.from({
      type: 'doc',
      content: [paragraph(text('관련 내용은 '), link(B, 'Electron Architecture'), text(' 참고'), link(C, 'Old'))],
    });
    expect(content.plainText).toBe('관련 내용은 Electron Architecture 참고Old');
    expect(content.referencedNoteIds).toEqual(new Set([B, C]));
  });

  it('ignores link nodes whose noteId is not a UUID', () => {
    const content = NoteContent.from({ type: 'doc', content: [paragraph(link('not-a-uuid', 'x'))] });
    expect(content.referencedNoteIds.size).toBe(0);
  });

  it('skips opaque atom nodes such as infographics', () => {
    const content = NoteContent.from({
      type: 'doc',
      content: [paragraph(text('위')), { type: 'infographic', attrs: { spec: { title: '숨김' } } }, paragraph(text('아래'))],
    });
    expect(content.plainText).toBe('위\n아래');
  });

  it('rejects a root that is not a doc', () => {
    expect(() => NoteContent.from({ type: 'paragraph' })).toThrow(
      expect.objectContaining({ code: 'NOTE_CONTENT_INVALID' }) as DomainError,
    );
    expect(() => NoteContent.from('nope')).toThrow(expect.objectContaining({ code: 'NOTE_CONTENT_INVALID' }));
  });

  it('rejects documents larger than 2 MB when serialized', () => {
    const huge = { type: 'doc', content: [paragraph(text('가'.repeat(700_000)))] };
    expect(() => NoteContent.from(huge)).toThrow(expect.objectContaining({ code: 'NOTE_CONTENT_TOO_LARGE' }));
  });

  it('provides an empty document', () => {
    const empty = NoteContent.empty();
    expect(empty.doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(empty.plainText).toBe('');
  });

  it('compares by serialized document', () => {
    const a = NoteContent.from({ type: 'doc', content: [paragraph(text('x'))] });
    const b = NoteContent.from({ type: 'doc', content: [paragraph(text('x'))] });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(NoteContent.empty())).toBe(false);
  });
});
