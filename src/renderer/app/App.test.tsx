// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('navigation', { name: 'Blink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/settings/ai');
    expect(await screen.findByText('vmock')).toBeInTheDocument();
  });

  it('renders the AI settings screen at #/settings/ai', () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI 설정' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the start screen', async () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
  });
});
