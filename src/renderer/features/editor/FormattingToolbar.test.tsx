// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './extensions';
import { FormattingToolbar } from './FormattingToolbar';

let editor: Editor;
afterEach(() => editor.destroy());

function setup(markdown = '첫 문장 두 번째') {
  editor = new Editor({ extensions: createEditorExtensions(), content: markdown, contentType: 'markdown' });
  render(<FormattingToolbar editor={editor} />);
  return userEvent.setup();
}
const selectWord = (word: string) => {
  const from = 1 + editor.state.doc.textContent.indexOf(word);
  act(() => {
    editor.commands.setTextSelection({ from, to: from + word.length });
  });
};

describe('FormattingToolbar (21st Rich Text Editor 구조)', () => {
  it('toggles bold on the selection and reports it with aria-pressed', async () => {
    const user = setup();
    selectWord('첫');
    const bold = screen.getByRole('button', { name: '굵게' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    await user.click(bold);
    expect(editor.getMarkdown()).toBe('**첫** 문장 두 번째');
    expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns the current paragraph into a heading and a list', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '제목' }));
    expect(editor.getMarkdown().trimEnd()).toBe('## 첫 문장 두 번째');
    await user.click(screen.getByRole('button', { name: '글머리 목록' }));
    expect(editor.getMarkdown().trimEnd()).toBe('- 첫 문장 두 번째');
  });

  it('is one Tab stop and moves between buttons with the arrow keys', async () => {
    const user = setup();
    const toolbar = screen.getByRole('toolbar', { name: '서식' });
    const enabled = [...toolbar.querySelectorAll('button:not(:disabled)')];
    expect(enabled.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);

    await user.tab();
    expect(screen.getByRole('button', { name: '제목' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '굵게' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(enabled.at(-1)).toHaveFocus();
  });

  it('adds a link from an inline address field instead of a browser prompt', async () => {
    const user = setup();
    selectWord('문장');
    await user.click(screen.getByRole('button', { name: '링크' }));
    const field = screen.getByRole('textbox', { name: '링크 주소' });
    await user.clear(field);
    await user.type(field, 'https://example.com{Enter}');
    expect(editor.getMarkdown()).toBe('첫 [문장](https://example.com) 두 번째');
    expect(screen.queryByRole('textbox', { name: '링크 주소' })).not.toBeInTheDocument();
  });

  it('closes the link field with Escape without changing the note', async () => {
    const user = setup();
    selectWord('문장');
    await user.click(screen.getByRole('button', { name: '링크' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: '링크 주소' })).not.toBeInTheDocument();
    expect(editor.getMarkdown()).toBe('첫 문장 두 번째');
  });

  it('enables undo only after an edit', async () => {
    const user = setup();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
    selectWord('첫');
    await user.click(screen.getByRole('button', { name: '기울임' }));
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(editor.getMarkdown()).toBe('첫 문장 두 번째');
  });
});
