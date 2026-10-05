// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizePlan } from '../../../shared/ipc/organize';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from '../notes/autosave/autosave';

const sidebarTree = () => within(screen.getByRole('region', { name: 'Note list' }));
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
      newFolders: [{ path: ['공부', 'Spring'], notes: [a, b].map((n) => ({ id: n.id, title: n.title, from: '' })) }],
      moves: [],
      skipped: null,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Organize vault' }));
    const dialog = await screen.findByRole('dialog', { name: 'Organize — Top of vault' });
    // 폴더 경로가 이름으로 보이고, "new folder"는 이름이 아니라 따로 붙은 꼬리표다
    const folderRow = (await within(dialog).findByText('공부 / Spring')).closest('li')!;
    expect(within(folderRow).getByText('new folder')).toBeInTheDocument();
    expect(within(folderRow).getByText('2 notes')).toBeInTheDocument();
    expect(within(dialog).queryByText(/^New folder /)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await sidebarTree().findByRole('treeitem', { name: '공부' })).toBeInTheDocument();
  });

  it('locks the sidebar while AI is classifying, even after the dialog is closed', async () => {
    await seedNote('spring boot 실무 1편');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    resetBlinkForTests({ organizePreview: (folder) => plan(folder), organizeGate: () => gate });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Organize vault' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    const locked = await screen.findByRole('group', { name: 'Edit vault' });
    expect(locked).toHaveAttribute('inert');
    expect(locked).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'AI organize status' })).toHaveTextContent('AI is organizing folders');

    release();
    await waitFor(() => expect(locked).not.toHaveAttribute('inert'));
    expect(screen.queryByRole('status', { name: 'AI organize status' })).not.toBeInTheDocument();
  });

  it('locks the sidebar while a new note is being placed after its first title', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    resetBlinkForTests({ organizePreview: (folder) => plan(folder), organizeGate: () => gate });
    const note = await getBlink().notes.create({}); // Untitled → 처음 제목을 붙이면 자동 배치
    window.location.hash = `#/notes/${note.id}`;
    const user = userEvent.setup();
    render(<App />);

    const title = await screen.findByRole('textbox', { name: 'Note title' });
    await user.clear(title);
    await user.type(title, '김치찌개 레시피{Enter}');

    expect(await screen.findByRole('group', { name: 'Edit vault' })).toHaveAttribute('inert');
    release();
    await waitFor(() => expect(screen.getByRole('group', { name: 'Edit vault' })).not.toHaveAttribute('inert'));
  });

  it('tells the user when there is nothing to group', async () => {
    await seedNote('김치찌개 레시피');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Organize vault' }));
    expect(await screen.findByText('No clear groups to split into')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('offers 분류하기 on folders but not on 미분류', async () => {
    await seedNote('a 노트', '', '공부');
    await seedNote('b 노트', '', '미분류');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Note list' });

    await user.click(await sidebarTree().findByRole('button', { name: '공부 folder menu' }));
    expect(screen.getByRole('menuitem', { name: 'Organize' })).toBeInTheDocument();
    await user.click(sidebarTree().getByRole('button', { name: '미분류 folder menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Organize' })).not.toBeInTheDocument();
  });

  it('places a new note only when its first title is set', async () => {
    const place = vi.spyOn(getBlink().organize, 'place');
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: /New note/ }))[0]!);
    const title = await screen.findByRole('textbox', { name: 'Note title' });
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
    const region = await screen.findByRole('region', { name: 'Note list' });
    const files = [new File([''], '사진.png')];
    const dataTransfer = { types: ['Files'], files, getData: () => '' };

    fireEvent.dragOver(region, { dataTransfer });
    fireEvent.drop(region, { dataTransfer });

    expect(await screen.findByText('Only .md files can be added')).toBeInTheDocument();
    expect(importFile).not.toHaveBeenCalled();
  });

  it('says which notes could not be moved and still shows the ones that were', async () => {
    const a = await seedNote('spring boot 실무 1편');
    plan = (folder) => ({
      folder,
      newFolders: [
        {
          path: ['Spring'],
          notes: [
            { id: a.id, title: a.title, from: '' },
            { id: '22222222-2222-4222-8222-222222222222', title: '잠긴 노트', from: '' },
          ],
        },
      ],
      moves: [],
      skipped: null,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Organize vault' }));
    const dialog = await screen.findByRole('dialog', { name: 'Organize — Top of vault' });
    await user.click(await within(dialog).findByRole('button', { name: 'Move' }));

    expect(await within(dialog).findByText("1 note couldn't be moved: 잠긴 노트")).toBeInTheDocument();
    expect(await sidebarTree().findByRole('treeitem', { name: 'Spring' })).toBeInTheDocument();
  });

  it('shows the notes imported before a dropped file failed', async () => {
    render(<App />);
    const region = await screen.findByRole('region', { name: 'Note list' });
    const files = [new File([''], 'a 노트.md'), new File([''], 'b #fail.md')];
    const dataTransfer = { types: ['Files'], files, getData: () => '' };

    fireEvent.dragOver(region, { dataTransfer });
    fireEvent.drop(region, { dataTransfer });

    expect(await screen.findByText('The file is open in another program. Close it and drop it again')).toBeInTheDocument();
    expect(await sidebarTree().findByText('a 노트')).toBeInTheDocument();
  });

  it('tells the user to connect OpenAI when importing without it', async () => {
    render(<App />);
    const region = await screen.findByRole('region', { name: 'Note list' });
    const dataTransfer = { types: ['Files'], files: [new File([''], 'c #noai.md')], getData: () => '' };

    fireEvent.dragOver(region, { dataTransfer });
    fireEvent.drop(region, { dataTransfer });

    expect(await screen.findByText('Connect OpenAI in Settings')).toBeInTheDocument();
  });

  it('tells the user to connect OpenAI when classifying without it', async () => {
    resetBlinkForTests({ organizePreviewError: 'AI_PROVIDER_NOT_CONFIGURED' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Organize vault' }));
    expect(await screen.findByText('Connect OpenAI in Settings')).toBeInTheDocument();
  });
});
