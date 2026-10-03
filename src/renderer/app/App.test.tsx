// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetAutosaveForTests } from '../features/notes/autosave/autosave';
import { resetBlinkForTests } from '../shared/api/blink';
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
    expect(within(sidebar).getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/settings/ai');
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

  it('renders the AI settings screen at #/settings/ai', async () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'AI 설정' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the start screen', async () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
  });
});
