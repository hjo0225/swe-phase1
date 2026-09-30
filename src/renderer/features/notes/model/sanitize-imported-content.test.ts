import { describe, expect, it } from 'vitest';
import { sanitizeImportedContent } from './sanitize-imported-content';

describe('sanitizeImportedContent', () => {
  it('drops aiPending marks but keeps other marks and the text', () => {
    const nodes = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '처리 중', marks: [{ type: 'aiPending', attrs: { jobId: 'j1' } }, { type: 'bold' }] },
          { type: 'text', text: '만', marks: [{ type: 'aiPending', attrs: { jobId: 'j1' } }] },
        ],
      },
    ];
    expect(sanitizeImportedContent(nodes)).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '처리 중', marks: [{ type: 'bold' }] },
          { type: 'text', text: '만' },
        ],
      },
    ]);
  });

  it('leaves links and atom nodes untouched and does not mutate the input', () => {
    const nodes = [
      { type: 'paragraph', content: [{ type: 'noteLink', attrs: { noteId: 'n', label: 'L' } }] },
      { type: 'infographic', attrs: { spec: { title: 't' } } },
    ];
    const before = structuredClone(nodes);
    expect(sanitizeImportedContent(nodes)).toEqual(before);
    expect(nodes).toEqual(before);
  });
});
