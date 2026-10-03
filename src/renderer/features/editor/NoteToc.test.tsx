// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorExtensions } from './extensions';
import { NoteToc } from './NoteToc';

let editor: Editor;
afterEach(() => {
  editor.destroy();
  vi.restoreAllMocks();
});

const open = (markdown: string) => {
  editor = new Editor({ extensions: createEditorExtensions(), content: markdown, contentType: 'markdown' });
  document.body.append(editor.view.dom);
  return render(<NoteToc editor={editor} />);
};

describe('NoteToc (21st Table of Contents 구조)', () => {
  it('lists the headings of the note in order with their level', () => {
    open('# 개요\n\n본문\n\n## 프로세스\n\n### Main\n\n## IPC');
    const nav = screen.getByRole('navigation', { name: '이 노트의 목차' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['개요', '프로세스', 'Main', 'IPC']);
    expect(links.map((a) => a.dataset.level)).toEqual(['1', '2', '3', '2']);
  });

  it('stays hidden for notes with fewer than two headings', () => {
    open('# 하나뿐\n\n본문');
    expect(screen.queryByRole('navigation', { name: '이 노트의 목차' })).not.toBeInTheDocument();
  });

  it('follows edits to the headings', () => {
    open('# 하나\n\n본문');
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size, '## 둘', { contentType: 'markdown' });
    });
    expect(screen.getByRole('link', { name: '둘' })).toBeInTheDocument();
  });

  it('scrolls to the heading when an entry is clicked', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    open('# 개요\n\n## 프로세스');
    await userEvent.setup().click(screen.getByRole('link', { name: '프로세스' }));
    expect(scroll).toHaveBeenCalledOnce();
    expect((scroll.mock.contexts[0] as HTMLElement).textContent).toBe('프로세스');
  });
});
