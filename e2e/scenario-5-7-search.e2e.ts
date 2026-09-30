import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';

async function writeNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: '새 노트' }).first().click();
  await page.getByRole('textbox', { name: '노트 제목' }).fill(title);
  await page.getByRole('textbox', { name: '노트 본문' }).click();
  await page.keyboard.type(body);
  // 목록에 제목이 보이면 저장까지 끝난 것이다.
  await page.getByRole('region', { name: '노트 목록' }).getByText(title).waitFor();
}

async function searchFor(page: Page, query: string) {
  await page.getByRole('textbox', { name: '노트 본문' }).click();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: '노트 검색' });
  await palette.getByRole('searchbox', { name: '노트 검색어' }).fill(query);
  return palette;
}

// 명세서 §41 Scenario 5(검색) · 6(연결 → 이동) · 7(내용 가져오기)
describe('Scenarios 5-7: search, link, import', () => {
  let userData: ReturnType<typeof createUserDataDir>;
  beforeEach(() => {
    userData = createUserDataDir();
  });
  afterEach(() => userData.cleanup());

  it('finds a past note, links it, follows the link, and imports its content', async () => {
    const { app, page } = await launchApp(userData.dir);
    try {
      await writeNote(page, 'Electron Architecture', 'Main Process와 Renderer Process의 차이');
      await writeNote(page, '오늘 작업', '관련 내용은 ');

      // Scenario 5: 검색 결과에 스니펫이 보인다
      let palette = await searchFor(page, 'renderer');
      const hit = palette.getByRole('article', { name: 'Electron Architecture' });
      await hit.getByText('Main Process와 Renderer Process의 차이').waitFor();
      if (process.env.BLINK_E2E_SHOTS) await page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/scenario-5.png` });

      // Scenario 6: 연결 → 링크 클릭 → 기존 노트로 이동
      await hit.getByRole('button', { name: '연결' }).click();
      const editor = page.getByRole('textbox', { name: '노트 본문' });
      const link = editor.getByRole('link', { name: 'Electron Architecture' });
      await link.waitFor();
      await link.click();
      await expect.poll(() => page.getByRole('textbox', { name: '노트 제목' }).inputValue()).toBe('Electron Architecture');
      await page
        .getByRole('region', { name: '이 노트를 참조하는 노트' })
        .getByRole('link', { name: '오늘 작업' })
        .click();
      await expect.poll(() => page.getByRole('textbox', { name: '노트 제목' }).inputValue()).toBe('오늘 작업');

      // Scenario 7: 내용 가져오기 → 현재 커서 위치에 삽입
      palette = await searchFor(page, 'electron');
      await palette.getByRole('article', { name: 'Electron Architecture' }).getByRole('button', { name: '내용 가져오기' }).click();
      await expect.poll(() => editor.textContent()).toContain('Main Process와 Renderer Process의 차이');
      if (process.env.BLINK_E2E_SHOTS) await page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/scenario-7.png` });
    } finally {
      await app.close();
    }
  });
});
