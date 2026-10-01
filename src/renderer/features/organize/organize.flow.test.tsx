// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizePlan } from '../../../shared/ipc/organize';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from '../notes/autosave/autosave';

const sidebarTree = () => within(screen.getByRole('region', { name: '노트 목록' }));
let plan: (folder: string) => OrganizePlan;

describe('organize flow', () => {
  beforeEach(() => {
    plan = (folder) => ({ folder, newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' });
    resetBlinkForTests({ organizePreview: (folder) => plan(folder) });
    resetAutosaveForTests();
    window.location.hash = '#/';
    localStorage.clear();
  });

  it('previews and applies a classification of the vault root', async () => {
    const a = await seedNote('spring boot 실무 1편');
    const b = await seedNote('spring boot 실무 2편');
    plan = (folder) => ({
      folder,
      newFolders: [{ name: 'Spring', notes: [a, b].map((n) => ({ id: n.id, title: n.title, from: '' })) }],
      moves: [],
      skipped: null,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '보관함 분류하기' }));
    const dialog = await screen.findByRole('dialog', { name: '분류하기 — 보관함 맨 위' });
    expect(await within(dialog).findByText('새 폴더 Spring')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '옮기기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await sidebarTree().findByRole('treeitem', { name: 'Spring' })).toBeInTheDocument();
  });

  it('tells the user when there is nothing to group', async () => {
    await seedNote('김치찌개 레시피');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '보관함 분류하기' }));
    expect(await screen.findByText('나눌 만한 묶음이 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '옮기기' })).toBeDisabled();
  });

  it('offers 분류하기 on folders but not on 미분류', async () => {
    await seedNote('a 노트', '', '공부');
    await seedNote('b 노트', '', '미분류');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: '노트 목록' });

    await user.click(await sidebarTree().findByRole('button', { name: '공부 폴더 메뉴' }));
    expect(screen.getByRole('menuitem', { name: '분류하기' })).toBeInTheDocument();
    await user.click(sidebarTree().getByRole('button', { name: '미분류 폴더 메뉴' }));
    expect(screen.queryByRole('menuitem', { name: '분류하기' })).not.toBeInTheDocument();
  });

  it('places a new note only when its first title is set', async () => {
    const place = vi.spyOn(getBlink().organize, 'place');
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: /새 노트/ }))[0]!);
    const title = await screen.findByRole('textbox', { name: '노트 제목' });
    await user.clear(title);
    await user.type(title, 'spring boot 실무 4편{Enter}');
    await waitFor(() => expect(place).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(title).toBeEnabled());
    await user.clear(title);
    await user.type(title, '다른 제목{Enter}');
    await waitFor(() => expect(title).toHaveValue('다른 제목'));
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('only accepts .md files when dropping', async () => {
    const importFile = vi.spyOn(getBlink().organize, 'importFile');
    render(<App />);
    const region = await screen.findByRole('region', { name: '노트 목록' });
    const files = [new File([''], '사진.png')];
    const dataTransfer = { types: ['Files'], files, getData: () => '' };

    fireEvent.dragOver(region, { dataTransfer });
    fireEvent.drop(region, { dataTransfer });

    expect(await screen.findByText('.md 파일만 넣을 수 있습니다')).toBeInTheDocument();
    expect(importFile).not.toHaveBeenCalled();
  });
});
