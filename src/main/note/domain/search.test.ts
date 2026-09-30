import { describe, expect, it } from 'vitest';
import { Note } from './note';
import { NoteContent } from './note-content';
import { NoteTitle } from './note-title';
import { SearchQuery } from './search-query';

describe('SearchQuery', () => {
  it('splits on whitespace and drops empty tokens', () => {
    expect(SearchQuery.parse('  electron   main\trenderer ').keywords).toEqual(['electron', 'main', 'renderer']);
  });

  it('is empty for blank input', () => {
    expect(SearchQuery.parse('   ').isEmpty()).toBe(true);
  });

  it('keeps at most 5 keywords of at most 100 characters', () => {
    const query = SearchQuery.parse(`a b c d e f ${'x'.repeat(150)}`);
    expect(query.keywords).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(SearchQuery.parse('y'.repeat(150)).keywords[0]).toHaveLength(100);
  });
});

describe('Note.snippetFor', () => {
  const noteWith = (text: string) =>
    Note.create({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: NoteTitle.of('Electron Architecture'),
      content: NoteContent.from({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }),
      now: new Date(0),
    });

  it('cuts 30 characters before and 90 after the first match with ellipses', () => {
    const text = `${'가'.repeat(50)}Renderer${'나'.repeat(200)}`;
    const snippet = noteWith(text).snippetFor(['renderer']);
    expect(snippet).toBe(`…${'가'.repeat(30)}Renderer${'나'.repeat(82)}…`);
  });

  it('uses the earliest match among keywords, case-insensitively', () => {
    expect(noteWith('Main Process와 renderer 차이').snippetFor(['RENDERER', 'main'])).toBe('Main Process와 renderer 차이');
  });

  it('normalizes whitespace and falls back to the preview when only the title matches', () => {
    const note = noteWith('첫 줄\n\n둘째 줄');
    expect(note.snippetFor(['architecture'])).toBe('첫 줄 둘째 줄');
  });
});
