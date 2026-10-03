// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from './autosave/autosave';

const tree = () => within(screen.getByRole('tree', { name: 'Vault' }));
const focusTargets = () => [...screen.getByRole('tree', { name: 'Vault' }).querySelectorAll<HTMLElement>('[data-tree-key]')];

async function seedVault() {
  await seedNote('계획', '', '회의');
  await seedNote('회고', '', '회의');
  await seedNote('로드맵', '', '회의/2026');
  await seedNote('아이디어');
  render(<App />);
  await screen.findByRole('tree', { name: 'Vault' });
}

describe('note tree (21st Tree View 구조)', () => {
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
    window.location.hash = '#/';
    localStorage.clear();
  });

  it('shows how many notes each folder holds, including subfolders', async () => {
    await seedVault();
    const meeting = await tree().findByRole('treeitem', { name: '회의' });
    expect(within(meeting).getByText('3')).toBeInTheDocument();
  });

  it('is one Tab stop and moves with the arrow keys, opening and closing folders', async () => {
    const user = userEvent.setup();
    await seedVault();
    await waitFor(() => expect(focusTargets().filter((el) => el.tabIndex === 0)).toHaveLength(1));

    focusTargets()[0]!.focus(); // 회의 (폴더가 먼저)
    expect(document.activeElement).toHaveTextContent('회의');
    await user.keyboard('{ArrowRight}'); // 펼치기
    expect(tree().getByRole('treeitem', { name: '회의' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowRight}'); // 첫 자식으로
    expect(document.activeElement).toHaveTextContent('2026');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('계획');
    await user.keyboard('{ArrowLeft}'); // 노트에서 ← 는 부모 폴더로
    expect(document.activeElement).toHaveTextContent('회의');
    await user.keyboard('{ArrowLeft}'); // 열린 폴더에서 ← 는 접기
    expect(tree().getByRole('treeitem', { name: '회의' })).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveTextContent('아이디어');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveTextContent('회의');
    // 지금 포커스만 Tab 순서에 남는다
    expect(focusTargets().filter((el) => el.tabIndex === 0)).toEqual([document.activeElement]);
  });

  it('jumps to the next item starting with a typed letter', async () => {
    const user = userEvent.setup();
    await seedNote('alpha');
    await seedNote('beta');
    await seedNote('bravo');
    render(<App />);
    await screen.findByRole('tree', { name: 'Vault' });
    focusTargets()[0]!.focus();
    await user.keyboard('b');
    expect(document.activeElement).toHaveTextContent('beta');
    await user.keyboard('b');
    expect(document.activeElement).toHaveTextContent('bravo');
  });

  it('draws depth guides for nested items', async () => {
    const user = userEvent.setup();
    await seedVault();
    await user.click(tree().getByRole('button', { name: '회의' }));
    const nested = await tree().findByRole('treeitem', { name: '계획' });
    expect(nested).toHaveAttribute('aria-level', '2');
    expect(nested.querySelector('[data-guides]')).toHaveStyle({ width: '16px' });
  });

  it('opens a folder menu with a right click', async () => {
    const user = userEvent.setup();
    await seedVault();
    await user.pointer({ keys: '[MouseRight]', target: tree().getByRole('button', { name: '회의' }) });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
  });
});

describe('sidebar search field', () => {
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
    window.location.hash = '#/';
  });

  it('opens the search palette from the field at the top of the sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Search notes/ }));
    expect(await screen.findByRole('dialog', { name: 'Search notes' })).toBeInTheDocument();
  });
});
