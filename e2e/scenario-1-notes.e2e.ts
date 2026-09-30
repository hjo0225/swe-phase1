import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLikeUser, createUserDataDir, launchApp } from './support/app';

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
      await first.page.getByRole('button', { name: '새 노트' }).first().click();
      await first.page.getByRole('textbox', { name: '노트 제목' }).fill('종료 직전 제목');
      await first.page.getByRole('textbox', { name: '노트 본문' }).click();
      await first.page.keyboard.type('Electron은 데스크톱 앱 프레임워크다.');
    } finally {
      // debounce(700ms)가 지나기 전에 닫는다 → 종료 flush가 없으면 유실된다.
      await closeLikeUser(first.app);
    }

    const second = await launchApp(userData.dir);
    try {
      const { page } = second;
      await page.getByRole('region', { name: '노트 목록' }).getByText('종료 직전 제목').waitFor({ timeout: 10_000 });
      await expect.poll(() => page.getByRole('textbox', { name: '노트 제목' }).inputValue()).toBe('종료 직전 제목');
      await expect
        .poll(() => page.getByRole('textbox', { name: '노트 본문' }).textContent())
        .toContain('Electron은 데스크톱 앱 프레임워크다.');
      if (process.env.BLINK_E2E_SHOTS) {
        await second.page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/scenario-1.png` });
      }
    } finally {
      await second.app.close();
    }
  });
});
