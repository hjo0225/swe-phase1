// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import type { MockControls } from '../../mocks/createMockBlink';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from './autosave/autosave';

const sidebarTree = () => within(screen.getByRole('region', { name: '노트 목록' }));
const titleInput = () => screen.findByRole('textbox', { name: '노트 제목' });
const body = () => screen.findByRole('textbox', { name: '노트 본문' });

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

    expect(await screen.findByText('아직 노트가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeEmptyDOMElement(); // 노트가 없으면 오른쪽은 비어 있다
    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);

    expect(await titleInput()).toHaveValue('제목 없음');
    expect(window.location.hash).toMatch(/^#\/notes\/[0-9a-f-]{36}$/);
    expect(await sidebarTree().findByText('제목 없음')).toBeInTheDocument();
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

    expect(await screen.findByRole('alert')).toHaveTextContent('같은 이름의 노트');
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
    expect(screen.getByText('저장됨')).toBeInTheDocument();
  });

  it('shows the saved content when returning to a note created in this session', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('아직 노트가 없습니다');

    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);
    await user.click(await body());
    await user.keyboard('첫 번째 본문');
    await waitFor(() => expect(controls.contentOf!('제목 없음.md')).toBe('첫 번째 본문'), { timeout: 3000 });

    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '노트 제목' })).toHaveValue('제목 없음 2'));

    await user.click(sidebarTree().getByText('제목 없음'));
    expect(await screen.findByText('첫 번째 본문')).toBeInTheDocument();
  });

  it('redirects the start screen to the most recently updated note', async () => {
    await seedNote('오래된 노트', '예전');
    const recent = await seedNote('최근 노트', '방금');
    render(<App />);

    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${recent.id}`));
    expect(await titleInput()).toHaveValue('최근 노트');
  });

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup();
    const { id } = await seedNote('지울 노트');
    window.location.hash = `#/notes/${id}`;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '노트 삭제' }));
    const dialog = screen.getByRole('dialog', { name: '노트를 삭제할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('아직 노트가 없습니다')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toBeEmptyDOMElement());
    await expect(getBlink().notes.get({ id })).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
  });

  it('keeps the note when deletion is cancelled', async () => {
    const user = userEvent.setup();
    const { id } = await seedNote('남길 노트');
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

  it('creates a folder from the sidebar and new notes inside the selected folder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('아직 노트가 없습니다');

    await user.click(screen.getByRole('button', { name: '새 폴더' }));
    await user.type(screen.getByRole('textbox', { name: '폴더 이름' }), '프로젝트{Enter}');
    await user.click(await sidebarTree().findByRole('button', { name: '프로젝트' }));
    await user.click(screen.getAllByRole('button', { name: /새 노트/ })[0]!);

    await titleInput();
    const tree = await getBlink().notes.tree();
    expect(tree).toMatchObject({ folders: ['프로젝트'], notes: [{ path: '프로젝트/제목 없음.md' }] });
    expect(sidebarTree().getByRole('treeitem', { name: '프로젝트' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows where the note lives, how long it is, and a table of contents for its headings', async () => {
    const note = await seedNote('계획', '# 목표\n\n분기 목표를 정한다.\n\n## 일정\n\n다음 주까지', '회의');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);

    const crumbs = await screen.findByRole('navigation', { name: '노트 위치' });
    expect(crumbs).toHaveTextContent('Mock회의계획');
    expect(await screen.findByText(/수정 · \d+자 · 약 1분$/)).toBeInTheDocument();
    const toc = await screen.findByRole('navigation', { name: '이 노트의 목차' });
    expect(within(toc).getAllByRole('link').map((a) => a.textContent)).toEqual(['목표', '일정']);
    expect(screen.getByRole('toolbar', { name: '서식' })).toBeInTheDocument();
  });

  it('renames and deletes a folder from its menu', async () => {
    const user = userEvent.setup();
    await seedNote('계획', '', '회의');
    render(<App />);
    await screen.findByRole('region', { name: '노트 목록' });

    await user.click(await sidebarTree().findByRole('button', { name: '회의 폴더 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '이름 바꾸기' }));
    const input = screen.getByRole('textbox', { name: '폴더 이름' });
    await user.clear(input);
    await user.type(input, '2026 회의{Enter}');
    expect(await sidebarTree().findByRole('button', { name: '2026 회의' })).toBeInTheDocument();

    await user.click(sidebarTree().getByRole('button', { name: '2026 회의 폴더 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('노트 1개');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

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
    expect(screen.queryByText('이 노트가 다른 곳에서 바뀌었습니다.')).not.toBeInTheDocument();
  });

  it('asks before discarding local edits when the file changed outside', async () => {
    const user = userEvent.setup();
    const note = await seedNote('충돌', '처음');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    await user.click(await screen.findByText('처음'));
    await user.keyboard(' 내 편집');

    controls.externalEdit!(note.id, '밖에서 고침');

    expect(await screen.findByText('이 노트가 다른 곳에서 바뀌었습니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /다시 불러오기/ }));
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

    await user.click(await screen.findByRole('button', { name: /폴더 열기/ }));

    expect(await screen.findByRole('button', { name: '보관함: Mock' })).toBeInTheDocument();
    expect(await screen.findByText('아직 노트가 없습니다')).toBeInTheDocument();
  });
});
