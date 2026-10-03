// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { resetAutosaveForTests } from '../features/notes/autosave/autosave';
import { resetBlinkForTests } from '../shared/api/blink';
import { seedNote } from '../test/seed-note';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    window.location.hash = '';
    resetBlinkForTests();
    resetAutosaveForTests();
  });

  it('puts the vault switcher and settings at the bottom of the sidebar, without the app version', async () => {
    window.location.hash = '#/';
    render(<App />);
    const sidebar = await screen.findByRole('navigation', { name: 'Blink' });
    expect(within(sidebar).getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/?settings');
    // 보관함 전환은 트리 아래(맨 아래 줄)에 있다
    const tree = within(sidebar).getByRole('region', { name: '노트 목록' });
    const vault = await within(sidebar).findByRole('button', { name: '보관함: Mock' });
    expect(tree.compareDocumentPosition(vault) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sidebar).queryByText(/^v/)).not.toBeInTheDocument();
  });

  it('shows the app version on the settings screen', async () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(await screen.findByText('Blink vmock')).toBeInTheDocument();
  });

  it('shows the AI provider status only on the settings screen, not in the sidebar', async () => {
    window.location.hash = '#/';
    render(<App />);
    const sidebar = await screen.findByRole('navigation', { name: 'Blink' });
    expect(within(sidebar).queryByText('AI 설정 필요')).not.toBeInTheDocument();

    window.location.hash = '#/settings/ai';
    expect(await screen.findByText('사용 중')).toBeInTheDocument();
    expect(screen.getByText('AI 설정 필요')).toBeInTheDocument();
  });

  it('opens AI settings as a modal over the current note and closes it with the button, Escape or the backdrop', async () => {
    const user = userEvent.setup();
    const note = await seedNote('메모', '본문');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    await screen.findByRole('textbox', { name: '노트 본문' });

    await user.click(screen.getByRole('link', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: 'AI 설정' });
    expect(window.location.hash).toBe(`#/notes/${note.id}?settings`);
    expect(screen.getByRole('textbox', { name: '노트 본문' })).toBeInTheDocument(); // 노트는 뒤에 그대로
    await user.click(within(modal).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI 설정' })).not.toBeInTheDocument());
    expect(window.location.hash).toBe(`#/notes/${note.id}`);

    await user.click(screen.getByRole('link', { name: '설정' }));
    await screen.findByRole('dialog', { name: 'AI 설정' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI 설정' })).not.toBeInTheDocument());
  });

  it('still opens the settings modal from the old #/settings/ai address', async () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(await screen.findByRole('dialog', { name: 'AI 설정' })).toBeInTheDocument();
  });

  it('shows nothing on the right when the vault has no notes', async () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(await screen.findByText('아직 노트가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
  });
});
