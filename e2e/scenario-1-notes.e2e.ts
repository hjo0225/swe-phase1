import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLikeUser, createUserDataDir, launchApp } from './support/app';
import { setTitle } from './support/editor';

// 명세서 §41 Scenario 1 — 실행 → 노트 생성 → 작성 → 종료 → 재실행 → 유지
describe('Scenario 1: notes survive a restart', () => {
  let userData: ReturnType<typeof createUserDataDir>;

  beforeEach(() => {
    userData = createUserDataDir();
  });
  afterEach(() => userData.cleanup());

  it('keeps edits typed right before the window closes (close flush)', async () => {
    const first = await launchApp(userData.dir);
    try {
      await first.page.getByRole('button', { name: 'New note' }).first().click();
      await setTitle(first.page, '종료 직전 제목');
      await first.page.getByRole('textbox', { name: 'Note body' }).click();
      await first.page.keyboard.type('Electron은 데스크톱 앱 프레임워크다.');
    } finally {
      // debounce(700ms)가 지나기 전에 닫는다 → 종료 flush가 없으면 유실된다.
      await closeLikeUser(first.app);
    }

    // 보관함 폴더의 .md 파일이 원본이다 (D-14)
    const file = join(userData.vault, '종료 직전 제목.md');
    expect(readFileSync(file, 'utf8')).toBe('Electron은 데스크톱 앱 프레임워크다.');

    const second = await launchApp(userData.dir);
    try {
      const { page } = second;
      await page.getByRole('region', { name: 'Note list' }).getByText('종료 직전 제목').waitFor({ timeout: 10_000 });
      await expect.poll(() => page.getByRole('textbox', { name: 'Note title' }).inputValue()).toBe('종료 직전 제목');
      await expect
        .poll(() => page.getByRole('textbox', { name: 'Note body' }).textContent())
        .toContain('Electron은 데스크톱 앱 프레임워크다.');
      if (process.env.BLINK_E2E_SHOTS) {
        await second.page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/scenario-1.png` });
      }
    } finally {
      await second.app.close();
    }
  });
});

// D-14: 사용자가 고른 폴더가 보관함 — 폴더 구조가 사이드바 트리, 밖에서 바꾼 파일도 반영
describe('Vault folder', () => {
  let userData: ReturnType<typeof createUserDataDir>;

  beforeEach(() => {
    userData = createUserDataDir();
  });
  afterEach(() => userData.cleanup());

  it('creates folders and notes as real files and picks up files changed outside the app', async () => {
    const { app, page } = await launchApp(userData.dir);
    try {
      const tree = page.getByRole('region', { name: 'Note list' });

      // 사이드바에서 폴더 만들기 → 그 폴더 안에 새 노트
      await page.getByRole('button', { name: 'New folder' }).click();
      await page.getByRole('textbox', { name: 'Folder name' }).fill('프로젝트');
      await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
      await tree.getByRole('button', { name: '프로젝트', exact: true }).click();
      await page.getByRole('button', { name: 'New note' }).first().click();
      await setTitle(page, '계획');
      await page.getByRole('textbox', { name: 'Note body' }).click();
      await page.keyboard.type('첫 줄');
      await page.getByText('Saved').waitFor();
      expect(readFileSync(join(userData.vault, '프로젝트', '계획.md'), 'utf8')).toBe('첫 줄');

      // 다른 앱이 새 파일을 만들면 트리에 나타난다
      writeFileSync(join(userData.vault, '밖에서 만든 노트.md'), '# 외부\n\n[[계획]] 참고');
      await tree.getByRole('link', { name: '밖에서 만든 노트' }).waitFor({ timeout: 10_000 });

      // 열린 노트를 밖에서 고치면 (편집 대기 없음) 다시 불러온다
      writeFileSync(join(userData.vault, '프로젝트', '계획.md'), '밖에서 고친 내용');
      await expect
        .poll(() => page.getByRole('textbox', { name: 'Note body' }).textContent(), { timeout: 10_000 })
        .toContain('밖에서 고친 내용');

      // 이름을 바꾸면 그 노트를 가리키던 링크도 고쳐진다
      await setTitle(page, '2026 계획');
      expect(existsSync(join(userData.vault, '프로젝트', '2026 계획.md'))).toBe(true);
      await expect
        .poll(() => readFileSync(join(userData.vault, '밖에서 만든 노트.md'), 'utf8'))
        .toBe('# 외부\n\n[[2026 계획]] 참고');
      if (process.env.BLINK_E2E_SHOTS) await page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/vault.png` });
    } finally {
      await app.close();
    }
  });
});
