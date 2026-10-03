import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';
import { setTitle } from './support/editor';

async function writeNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'New note' }).first().click();
  await setTitle(page, title);
  await page.getByRole('textbox', { name: 'Note body' }).click();
  await page.keyboard.type(body);
  await page.getByText('Saved').waitFor();
}

async function searchFor(page: Page, query: string) {
  await page.getByRole('textbox', { name: 'Note body' }).click();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search notes' });
  await palette.getByRole('searchbox', { name: 'Search query' }).fill(query);
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
      await hit.getByRole('button', { name: 'Link' }).click();
      const editor = page.getByRole('textbox', { name: 'Note body' });
      const link = editor.getByRole('link', { name: 'Electron Architecture' });
      await link.waitFor();
      await link.click();
      await expect.poll(() => page.getByRole('textbox', { name: 'Note title' }).inputValue()).toBe('Electron Architecture');
      await page
        .getByRole('region', { name: 'Linked from' })
        .getByRole('link', { name: '오늘 작업' })
        .click();
      await expect.poll(() => page.getByRole('textbox', { name: 'Note title' }).inputValue()).toBe('오늘 작업');

      // Scenario 7: 내용 가져오기 → 현재 커서 위치에 삽입
      palette = await searchFor(page, 'electron');
      await palette.getByRole('article', { name: 'Electron Architecture' }).getByRole('button', { name: 'Import' }).click();
      await expect.poll(() => editor.textContent()).toContain('Main Process와 Renderer Process의 차이');
      if (process.env.BLINK_E2E_SHOTS) await page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/scenario-7.png` });
    } finally {
      await app.close();
    }
  });
});
