// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import type { MockControls } from '../../mocks/createMockBlink';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from './autosave/autosave';

const sidebarTree = () => within(screen.getByRole('region', { name: 'Note list' }));
const titleInput = () => screen.findByRole('textbox', { name: 'Note title' });
const body = () => screen.findByRole('textbox', { name: 'Note body' });

let controls: Partial<MockControls>;

describe('notes flow (vault)', () => {
  beforeEach(() => {
    controls = {};
    resetBlinkForTests({ controls });
    resetAutosaveForTests();
    window.location.hash = '#/';
    localStorage.clear();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the empty state and creates a note named after its file', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeEmptyDOMElement(); // 노트가 없으면 오른쪽은 비어 있다
    await user.click(screen.getAllByRole('button', { name: /New note/ })[0]!);

    expect(await titleInput()).toHaveValue('Untitled');
    expect(window.location.hash).toMatch(/^#\/notes\/[0-9a-f-]{36}$/);
    expect(await sidebarTree().findByText('Untitled')).toBeInTheDocument();
  });

  it('renames the note file when the title is committed with Enter', async () => {
    const user = userEvent.setup();
    const note = await seedNote('');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    const input = await titleInput();
    await user.clear(input);
    await user.type(input, '회의록{Enter}');

    expect(await sidebarTree().findByText('회의록')).toBeInTheDocument();
    await expect(getBlink().notes.get({ id: note.id })).resolves.toMatchObject({ title: '회의록', path: '회의록.md' });
  });

  it('keeps the old title and explains why when the name is taken', async () => {
    const user = userEvent.setup();
    await seedNote('계획');
    const note = await seedNote('메모');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    const input = await titleInput();
    await user.clear(input);
    await user.type(input, '계획{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('A note with this name');
    expect(input).toHaveValue('메모');
  });

  it('autosaves the body as markdown into the note file', async () => {
    const user = userEvent.setup();
    const note = await seedNote('일지');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    await user.click(await body());
    await user.keyboard('오늘 한 일');

    await waitFor(() => expect(controls.contentOf!('일지.md')).toBe('오늘 한 일'), { timeout: 3000 });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows the saved content when returning to a note created in this session', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('No notes yet');

    await user.click(screen.getAllByRole('button', { name: /New note/ })[0]!);
    await user.click(await body());
    await user.keyboard('첫 번째 본문');
    await waitFor(() => expect(controls.contentOf!('Untitled.md')).toBe('첫 번째 본문'), { timeout: 3000 });

    await user.click(screen.getAllByRole('button', { name: /New note/ })[0]!);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveValue('Untitled 2'));

    await user.click(sidebarTree().getByText('Untitled'));
    expect(await screen.findByText('첫 번째 본문')).toBeInTheDocument();
  });

  it('redirects the start screen to the most recently updated note', async () => {
    await seedNote('오래된 노트', '예전');
    const recent = await seedNote('최근 노트', '방금');
    render(<App />);

    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${recent.id}`));
    expect(await titleInput()).toHaveValue('최근 노트');
  });

  it('previews the PDF with page settings and exports with them after saving the latest edits', async () => {
    const user = userEvent.setup();
    const note = await seedNote('포스터');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    await user.click(await body());
    await user.keyboard('마지막 문장');
    // debounce를 기다리지 않고 바로 누른다 — Main은 파일을 다시 읽어 그리므로 먼저 저장해야 한다
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    const dialog = await screen.findByRole('dialog', { name: 'Export PDF' });
    const inDialog = within(dialog);
    expect(inDialog.getByRole('switch', { name: 'Include note title' })).toHaveAttribute('aria-checked', 'true');
    expect(inDialog.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
    expect(inDialog.getByRole('radio', { name: 'Portrait' })).toHaveAttribute('aria-checked', 'true');
    expect(inDialog.getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
    expect(inDialog.getByRole('switch', { name: 'Fit to one page' })).toHaveAttribute('aria-checked', 'true');
    expect(await inDialog.findByText('1 page · A4 portrait · 100%')).toBeInTheDocument();

    await user.click(inDialog.getByRole('radio', { name: 'Letter' }));
    await user.click(inDialog.getByRole('radio', { name: 'Landscape' }));
    await user.click(inDialog.getByRole('radio', { name: 'None' }));
    await user.click(inDialog.getByRole('switch', { name: 'Fit to one page' }));
    await user.click(inDialog.getByRole('switch', { name: 'Include note title' }));
    expect(await inDialog.findByText('1 page · Letter landscape · 100%')).toBeInTheDocument();

    await user.click(inDialog.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Saved as PDF')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(controls.pdfExports!()).toEqual([
      {
        id: note.id,
        content: '마지막 문장',
        options: { pageSize: 'Letter', orientation: 'landscape', margin: 'none', includeTitle: false, fitToOnePage: false },
      },
    ]);
  });

  it('leaves the title out by default when the note already starts with a heading', async () => {
    const user = userEvent.setup();
    const note = await seedNote('포스터', '# 연구 개요\n\n본문');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Export PDF' }));
    const toggle = within(await screen.findByRole('dialog', { name: 'Export PDF' })).getByRole('switch', { name: 'Include note title' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('The note already starts with a heading');
  });

  it('closes without exporting on Cancel and stays open when the save dialog is cancelled', async () => {
    const user = userEvent.setup();
    const note = await seedNote('포스터', '#cancel-pdf');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Export PDF' }));
    let dialog = await screen.findByRole('dialog', { name: 'Export PDF' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(controls.pdfExports!()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    dialog = await screen.findByRole('dialog', { name: 'Export PDF' });
    await user.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(controls.pdfExports!()).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: 'Export PDF' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Export' })).toBeEnabled();
  });

  it('warns when the note was too long to fit on one page', async () => {
    const user = userEvent.setup();
    const note = await seedNote('긴 노트', '#clip-pdf');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Export PDF' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Export PDF' })).getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Saved as PDF, but the note was too long and the bottom was cut off')).toBeInTheDocument();
  });

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup();
    const { id } = await seedNote('지울 노트');
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete note' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this note?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toBeEmptyDOMElement());
    await expect(getBlink().notes.get({ id })).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
  });

  it('keeps the note when deletion is cancelled', async () => {
    const user = userEvent.setup();
    const { id } = await seedNote('남길 노트');
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete note' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(getBlink().notes.get({ id })).resolves.toMatchObject({ title: '남길 노트' });
  });

  it('shows a not-found state for unknown notes', async () => {
    window.location.hash = '#/notes/99999999-9999-4999-8999-999999999999';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Note not found' })).toBeInTheDocument();
  });

  it('creates a folder from the sidebar and new notes inside the selected folder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('No notes yet');

    await user.click(screen.getByRole('button', { name: 'New folder' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), '프로젝트{Enter}');
    await user.click(await sidebarTree().findByRole('button', { name: '프로젝트' }));
    await user.click(screen.getAllByRole('button', { name: /New note/ })[0]!);

    await titleInput();
    const tree = await getBlink().notes.tree();
    expect(tree).toMatchObject({ folders: ['프로젝트'], notes: [{ path: '프로젝트/Untitled.md' }] });
    expect(sidebarTree().getByRole('treeitem', { name: '프로젝트' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows where the note lives, how long it is, and a table of contents for its headings', async () => {
    const note = await seedNote('계획', '# 목표\n\n분기 목표를 정한다.\n\n## 일정\n\n다음 주까지', '회의');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    const crumbs = await screen.findByRole('navigation', { name: 'Note location' });
    expect(crumbs).toHaveTextContent('Mock회의계획');
    expect(await screen.findByText(/^Edited .+ · \d+ chars · 1 min read$/)).toBeInTheDocument();
    const toc = await screen.findByRole('navigation', { name: 'Table of contents' });
    expect(within(toc).getAllByRole('link').map((a) => a.textContent)).toEqual(['목표', '일정']);
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  });

  it('renames and deletes a folder from its menu', async () => {
    const user = userEvent.setup();
    await seedNote('계획', '', '회의');
    render(<App />);
    await screen.findByRole('region', { name: 'Note list' });

    await user.click(await sidebarTree().findByRole('button', { name: '회의 folder menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(input);
    await user.type(input, '2026 회의{Enter}');
    expect(await sidebarTree().findByRole('button', { name: '2026 회의' })).toBeInTheDocument();

    await user.click(sidebarTree().getByRole('button', { name: '2026 회의 folder menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('1 note and any subfolders');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(sidebarTree().queryByRole('button', { name: '2026 회의' })).not.toBeInTheDocument());
    await expect(getBlink().notes.tree()).resolves.toEqual({ folders: [], notes: [] });
  });

  it('rewrites links in other notes when a note is renamed', async () => {
    const user = userEvent.setup();
    const source = await seedNote('메모', '참고: [[계획]]');
    const target = await seedNote('계획');
    window.location.hash = `#/notes/${target.id}`;
    render(<App />);

    const input = await titleInput();
    await user.clear(input);
    await user.type(input, '2026 계획{Enter}');

    await waitFor(() => expect(controls.contentOf!('메모.md')).toBe('참고: [[2026 계획]]'));
    await expect(getBlink().notes.listLinks({ noteId: target.id })).resolves.toMatchObject({
      incoming: [{ noteId: source.id }],
    });
  });

  it('reloads an unedited note that changed outside the app', async () => {
    const note = await seedNote('외부', '처음');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    expect(await screen.findByText('처음')).toBeInTheDocument();

    controls.externalEdit!(note.id, '밖에서 고침');

    expect(await screen.findByText('밖에서 고침')).toBeInTheDocument();
    expect(screen.queryByText('This note changed somewhere else.')).not.toBeInTheDocument();
  });

  it('asks before discarding local edits when the file changed outside', async () => {
    const user = userEvent.setup();
    const note = await seedNote('충돌', '처음');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    await user.click(await screen.findByText('처음'));
    await user.keyboard(' 내 편집');

    controls.externalEdit!(note.id, '밖에서 고침');

    expect(await screen.findByText('This note changed somewhere else.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reload/ }));
    expect(await screen.findByText('밖에서 고침')).toBeInTheDocument();
  });
});

describe('vault picker', () => {
  beforeEach(() => {
    resetBlinkForTests({ vaultOpen: false });
    resetAutosaveForTests();
    window.location.hash = '#/';
  });

  it('asks for a vault folder first and opens the app once one is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Open folder/ }));

    expect(await screen.findByRole('button', { name: 'Vault: Mock' })).toBeInTheDocument();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('shows a decorative folder, the open button and what Blink promises', async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Open a vault' })).toBeInTheDocument();
    // 폴더 그림은 꾸밈이라 보조 기술에는 숨긴다
    const art = container.querySelector('[data-folder-art]');
    expect(art).toHaveAttribute('aria-hidden', 'true');
    const promises = screen.getByRole('list', { name: 'What Blink promises' });
    expect(within(promises).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Saved as plain Markdown files',
      'AI only touches what you select',
    ]);
    // 최근 보관함은 첫 화면이 아니라 사이드바 보관함 전환에서 고른다
    expect(screen.queryByRole('heading', { name: '최근 보관함' })).not.toBeInTheDocument();
  });
});
