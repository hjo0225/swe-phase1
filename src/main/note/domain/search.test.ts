import { describe, expect, it } from 'vitest';
import { previewOf, snippetOf } from './note-text';
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

describe('snippetOf', () => {
  it('cuts 30 characters before and 90 after the first match with ellipses', () => {
    const text = `${'가'.repeat(50)}Renderer${'나'.repeat(200)}`;
    expect(snippetOf(text, ['renderer'])).toBe(`…${'가'.repeat(30)}Renderer${'나'.repeat(82)}…`);
  });

  it('uses the earliest match among keywords, case-insensitively', () => {
    expect(snippetOf('Main Process와 renderer 차이', ['RENDERER', 'main'])).toBe('Main Process와 renderer 차이');
  });

  it('normalizes whitespace and falls back to the preview when only the title matches', () => {
    expect(snippetOf('첫 줄\n\n둘째 줄', ['architecture'])).toBe('첫 줄 둘째 줄');
  });
});

describe('previewOf', () => {
  it('builds a whitespace-normalized preview of at most 120 characters', () => {
    const preview = previewOf(`첫 줄\n\n둘째 줄 ${'x'.repeat(200)}`);
    expect(preview).toHaveLength(120);
    expect(preview.startsWith('첫 줄 둘째 줄 xxx')).toBe(true);
  });
});
