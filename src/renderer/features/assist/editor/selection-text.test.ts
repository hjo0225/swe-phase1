// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../../editor/extensions';
import { findPendingRanges, markPending } from './ai-pending';
import { selectionText } from './selection-text';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const open = (html: string) => {
  editor = new Editor({ extensions: createEditorExtensions(), content: html });
  return editor;
};
const all = (e: Editor) => selectionText(e.state.doc, 0, e.state.doc.content.size);
/** 글 하나(텍스트 노드 안)의 문서 위치 */
const rangeOf = (e: Editor, text: string) => {
  let from = -1;
  e.state.doc.descendants((node, pos) => {
    const i = node.isText ? node.text!.indexOf(text) : -1;
    if (i >= 0 && from < 0) from = pos + i;
  });
  return { from, to: from + text.length };
};

describe('selectionText', () => {
  it('is the plain text of a selection inside one block', () => {
    const e = open('<ul><li><p>Electron app with a React UI</p></li></ul>');
    const { from, to } = rangeOf(e, 'React UI');
    expect(selectionText(e.state.doc, from, to)).toBe('React UI');
  });

  it('joins plain paragraphs with line breaks like before', () => {
    const e = open('<p>First line.</p><p></p><p>Second line.</p>');
    expect(all(e)).toBe(e.state.doc.textBetween(0, e.state.doc.content.size, '\n'));
    expect(all(e)).toBe('First line.\n\nSecond line.');
  });

  it('keeps headings and list nesting across blocks so the AI sees the structure', () => {
    const e = open(
      '<h2>Components</h2>' +
        '<ul><li><p>Electron app</p><ul><li><p>UI</p></li><li><p>Main</p></li></ul></li><li><p>OpenAI</p></li></ul>' +
        '<h2>Flows</h2>' +
        '<ul><li><p>UI → Main: IPC</p></li></ul>',
    );
    expect(all(e)).toBe(['## Components', '- Electron app', '  - UI', '  - Main', '- OpenAI', '## Flows', '- UI → Main: IPC'].join('\n'));
  });

  it('numbers ordered lists, quotes block quotes and indents a second paragraph in a list item', () => {
    const e = open('<ol><li><p>Write</p><p>more about it</p></li><li><p>Save</p></li></ol><blockquote><p>Quoted</p></blockquote>');
    expect(all(e)).toBe(['1. Write', '   more about it', '2. Save', '> Quoted'].join('\n'));
  });

  it('reads a locked range the same way, so the commit check still matches the request', () => {
    const e = open('<h2>Components</h2><ul><li><p>Electron app</p><ul><li><p>UI</p></li></ul></li></ul>');
    const size = e.state.doc.content.size;
    markPending(e, 'job-1', { from: 0, to: size });
    const range = findPendingRanges(e.state.doc).get('job-1')!;
    expect(range.text).toBe(selectionText(e.state.doc, range.from, range.to));
    expect(range.text).toBe('## Components\n- Electron app\n  - UI');
  });
});
