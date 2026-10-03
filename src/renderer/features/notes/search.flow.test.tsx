// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from './autosave/autosave';


async function seed() {
  const past = await seedNote('Electron Architecture', 'Main Process와 Renderer 차이');
  const current = await seedNote('오늘 작업', '시작');
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
    await screen.findByRole('textbox', { name: 'Note body' });
    await user.keyboard('{Control>}k{/Control}');
    return screen.findByRole('dialog', { name: 'Search notes' });
  }

  it('opens with the shortcut, shows snippets, and opens a result', async () => {
    const user = userEvent.setup();
    const { past, current } = await seed();
    const palette = await openPalette(user, current.id);

    await user.type(within(palette).getByRole('searchbox', { name: 'Search query' }), 'renderer');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    expect(result).toHaveTextContent('Main Process와 Renderer 차이');
    expect(within(palette).queryByRole('article', { name: '오늘 작업' })).not.toBeInTheDocument();

    await user.click(within(result).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${past.id}`));
    expect(screen.queryByRole('dialog', { name: 'Search notes' })).not.toBeInTheDocument();
  });

  it('links the current note to a result and derives the link on save', async () => {
    const user = userEvent.setup();
    const { past, current } = await seed();
    const palette = await openPalette(user, current.id);

    await user.type(within(palette).getByRole('searchbox', { name: 'Search query' }), 'electron');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    await user.click(within(result).getByRole('button', { name: 'Link' }));

    const editor = screen.getByRole('textbox', { name: 'Note body' });
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

    await user.type(within(palette).getByRole('searchbox', { name: 'Search query' }), 'electron');
    const result = await within(palette).findByRole('article', { name: 'Electron Architecture' });
    await user.click(within(result).getByRole('button', { name: 'Import' }));

    const editor = screen.getByRole('textbox', { name: 'Note body' });
    expect(await within(editor).findByText('Main Process와 Renderer 차이')).toBeInTheDocument();
  });

  it('shows backlinks of the open note', async () => {
    const target = await seedNote('대상', 'x');
    await seedNote('출발 노트', '[[대상]]');
    window.location.hash = `#/notes/${target.id}`;
    render(<App />);

    const backlinks = await screen.findByRole('region', { name: 'Linked from' });
    expect(await within(backlinks).findByRole('link', { name: '출발 노트' })).toBeInTheDocument();
  });
});
