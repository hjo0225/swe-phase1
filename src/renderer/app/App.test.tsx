// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetBlinkForTests } from '../shared/api/blink';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    window.location.hash = '';
    resetBlinkForTests();
  });

  it('renders the sidebar and the start screen at #/', async () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Blink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/settings/ai');
    expect(screen.getByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
    expect(await screen.findByText('vmock')).toBeInTheDocument();
  });

  it('renders the AI settings screen at #/settings/ai', () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI 설정' })).toBeInTheDocument();
  });

  it('renders the note screen for #/notes/:noteId', () => {
    window.location.hash = '#/notes/abc';
    render(<App />);
    expect(screen.getByTestId('note-page')).toHaveAttribute('data-note-id', 'abc');
  });

  it('redirects unknown routes to the start screen', () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(screen.getByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
  });
});
