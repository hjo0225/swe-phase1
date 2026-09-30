// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { resetAutosaveForTests } from './autosave/autosave';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

async function seed() {
  const past = await getBlink().notes.create({ title: 'Electron Architecture', content: doc('Main Process와 Renderer 차이') });
  const current = await getBlink().notes.create({ title: '오늘 작업', content: doc('시작') });
  return { past, current };
}

describe('search palette', () => {
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  async function openPalette(user: ReturnType<typeof userEvent.setup>, currentId: string) {
    window.location.hash = `#/notes/${currentId}`;
    render(<App />);
    await screen.findByRole('textbox', { name: '노트 본문' });
    await user.keyboard('{Control>}k{/Control}');
    return screen.findByRole('dialog', { name: '노트 검색' });
  }

  it('opens with the shortcut, shows snippets, and opens a result', async () => {
    const user = userEvent.setup();
    const { past, current } = await seed();
    const palette = await openPalette(user, current.id);

    await user.type(within(palette).getByRole('searchbox', { name: '노트 검색어' }), 'renderer');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    expect(result).toHaveTextContent('Main Process와 Renderer 차이');
    expect(within(palette).queryByRole('article', { name: '오늘 작업' })).not.toBeInTheDocument();

    await user.click(within(result).getByRole('button', { name: '열기' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${past.id}`));
    expect(screen.queryByRole('dialog', { name: '노트 검색' })).not.toBeInTheDocument();
  });

  it('links the current note to a result and derives the link on save', async () => {
    const user = userEvent.setup();
    const { past, current } = await seed();
    const palette = await openPalette(user, current.id);

    await user.type(within(palette).getByRole('searchbox', { name: '노트 검색어' }), 'electron');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    await user.click(within(result).getByRole('button', { name: '연결' }));

    const editor = screen.getByRole('textbox', { name: '노트 본문' });
    expect(await within(editor).findByRole('link', { name: 'Electron Architecture' })).toBeInTheDocument();
    await waitFor(
      async () => expect((await getBlink().notes.listLinks({ noteId: current.id })).outgoing).toEqual([
        { noteId: past.id, title: 'Electron Architecture' },
      ]),
      { timeout: 3000 },
    );
  });

  it('imports the whole content of a result at the cursor', async () => {
    const user = userEvent.setup();
    const { current } = await seed();
    const palette = await openPalette(user, current.id);

    await user.type(within(palette).getByRole('searchbox', { name: '노트 검색어' }), 'electron');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    await user.click(within(result).getByRole('button', { name: '내용 가져오기' }));

    const editor = screen.getByRole('textbox', { name: '노트 본문' });
    expect(await within(editor).findByText('Main Process와 Renderer 차이')).toBeInTheDocument();
  });

  it('shows backlinks of the open note', async () => {
    const target = await getBlink().notes.create({ title: '대상', content: doc('x') });
    await getBlink().notes.create({
      title: '출발 노트',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'noteLink', attrs: { noteId: target.id, label: '대상' } }] }],
      },
    });
    window.location.hash = `#/notes/${target.id}`;
    render(<App />);

    const backlinks = await screen.findByRole('region', { name: '이 노트를 참조하는 노트' });
    expect(await within(backlinks).findByRole('link', { name: '출발 노트' })).toBeInTheDocument();
  });
});
