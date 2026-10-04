// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../../editor/extensions';
import { insertImportedContent } from './insert-imported-content';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

const parse = (e: Editor, markdown: string) => (e.markdown!.parse(markdown).content ?? []) as JSONContent[];
const topLevel = (e: Editor) => {
  const types: string[] = [];
  e.state.doc.forEach((node) => types.push(node.type.name === 'heading' ? `h${node.attrs.level as number}` : node.type.name));
  return types;
};

describe('insertImportedContent', () => {
  it('leaves the cursor on a new line below the import, so imports in a row stay side by side', () => {
    editor = new Editor({ extensions: createEditorExtensions(), content: '### 1. Key Features\n\nx', contentType: 'markdown' });
    // 섹션 아래 빈 줄에 커서
    editor.commands.setTextSelection({ from: editor.state.doc.content.size - 2, to: editor.state.doc.content.size - 1 });
    editor.commands.deleteSelection();

    insertImportedContent(editor, parse(editor, '#### 01. Notes\n\n- create\n- delete'));
    insertImportedContent(editor, parse(editor, '#### 02. Writing\n\n- organize'));

    // 두 번째 문서가 첫 문서의 목록 안으로 들어가지 않는다
    expect(topLevel(editor)).toEqual(['h3', 'h4', 'bulletList', 'h4', 'bulletList', 'paragraph']);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1);
  });

  it('inserts in the middle of a paragraph at the cursor and continues below it', () => {
    editor = new Editor({ extensions: createEditorExtensions(), content: 'before\n\nafter', contentType: 'markdown' });
    editor.commands.setTextSelection(7); // "before" 끝
    insertImportedContent(editor, parse(editor, '- item'));
    expect(editor.getMarkdown()).toContain('- item');
    expect(editor.getMarkdown().indexOf('before')).toBeLessThan(editor.getMarkdown().indexOf('- item'));
    expect(editor.getMarkdown().indexOf('- item')).toBeLessThan(editor.getMarkdown().indexOf('after'));
  });
});
