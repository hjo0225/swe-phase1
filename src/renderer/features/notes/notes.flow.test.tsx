// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { resetAutosaveForTests } from './autosave/autosave';

const sidebarList = () => within(screen.getByRole('region', { name: '노트 목록' }));

describe('notes flow', () => {
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
    window.location.hash = '#/';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the empty state and creates a note from it', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '첫 노트를 만들어 보세요' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);

    expect(await screen.findByRole('textbox', { name: '노트 제목' })).toHaveValue('');
    expect(window.location.hash).toMatch(/^#\/notes\/[0-9a-f-]{36}$/);
    expect(await sidebarList().findByText('제목 없음')).toBeInTheDocument();
  });

  it('autosaves the title and reflects it in the sidebar', async () => {
    const user = userEvent.setup();
    const { id } = await getBlink().notes.create({});
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.type(await screen.findByRole('textbox', { name: '노트 제목' }), '회의록');

    expect(await sidebarList().findByText('회의록', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('저장됨')).toBeInTheDocument();
    await expect(getBlink().notes.get({ id })).resolves.toMatchObject({ title: '회의록' });
  });

  it('shows the saved content when returning to a note created in this session', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: '첫 노트를 만들어 보세요' });

    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);
    await user.type(await screen.findByRole('textbox', { name: '노트 제목' }), '첫 번째');
    await sidebarList().findByText('첫 번째', {}, { timeout: 3000 });

    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '노트 제목' })).toHaveValue(''));

    await user.click(sidebarList().getByText('첫 번째'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '노트 제목' })).toHaveValue('첫 번째'));
  });

  it('redirects the start screen to the most recently updated note', async () => {
    await getBlink().notes.create({ title: '오래된 노트' });
    const recent = await getBlink().notes.create({ title: '최근 노트' });
    render(<App />);

    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${recent.id}`));
    expect(await screen.findByRole('textbox', { name: '노트 제목' })).toHaveValue('최근 노트');
  });

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup();
    const { id } = await getBlink().notes.create({ title: '지울 노트' });
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '노트 삭제' }));
    const dialog = screen.getByRole('dialog', { name: '노트를 삭제할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('heading', { name: '첫 노트를 만들어 보세요' })).toBeInTheDocument();
    await expect(getBlink().notes.get({ id })).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
  });

  it('keeps the note when deletion is cancelled', async () => {
    const user = userEvent.setup();
    const { id } = await getBlink().notes.create({ title: '남길 노트' });
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '노트 삭제' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(getBlink().notes.get({ id })).resolves.toMatchObject({ title: '남길 노트' });
  });

  it('shows a not-found state for unknown notes', async () => {
    window.location.hash = '#/notes/99999999-9999-4999-8999-999999999999';
    render(<App />);
    expect(await screen.findByRole('heading', { name: '노트를 찾을 수 없습니다' })).toBeInTheDocument();
  });
});
