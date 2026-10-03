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

  it('renders the sidebar with settings link and app version', async () => {
    window.location.hash = '#/';
    render(<App />);
    expect(await screen.findByRole('navigation', { name: 'Blink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/settings/ai');
    expect(await screen.findByText('vmock')).toBeInTheDocument();
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
