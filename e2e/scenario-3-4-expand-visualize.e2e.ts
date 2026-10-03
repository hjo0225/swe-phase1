import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';
import { selectText, setTitle } from './support/editor';


async function configureAndWrite(page: Page, body: string) {
  await page.getByRole('link', { name: '설정' }).click();
  const form = page.getByRole('form', { name: 'AI 설정' });
  await form.getByRole('combobox', { name: '모델' }).selectOption('gpt-5.4-mini');
  await form.getByLabel('API Key').fill('sk-e2e-test');
  await form.getByRole('button', { name: '저장' }).click();
  await page.getByText('OpenAI · GPT-5.4 mini (권장)').waitFor();
  await page.getByRole('dialog', { name: 'AI 설정' }).getByRole('button', { name: '닫기' }).click();

  await page.getByRole('button', { name: '새 노트' }).first().click();
  await setTitle(page, 'Electron');
  await page.getByRole('textbox', { name: '노트 본문' }).click();
  await page.keyboard.type(body);
}

// 명세서 §41 Scenario 3(구체화) · Scenario 4(시각화 → Preview → PNG 저장)
describe('Scenarios 3 & 4: expand and visualize', () => {
  let userData: ReturnType<typeof createUserDataDir>;
  beforeEach(() => {
    userData = createUserDataDir();
  });
  afterEach(() => userData.cleanup());

  it('expands with web sources, visualizes below the original, and saves the infographic as PNG', async () => {
    const pngPath = join(userData.dir, 'saved-infographic.png');
    const { app, page } = await launchApp(userData.dir, { BLINK_FAKE_LLM: '1', BLINK_E2E_SAVE_PATH: pngPath });
    const shots = process.env.BLINK_E2E_SHOTS;
    try {
      await configureAndWrite(page, 'Electron은 데스크톱 앱을 만드는 프레임워크다.');
      const body = page.getByRole('textbox', { name: '노트 본문' });

      // Scenario 3: 구체화 → Web Search → 출처 포함 재작성
      await selectText(page, 'Electron은 데스크톱 앱을 만드는 프레임워크다.');
      await page.getByRole('toolbar', { name: 'AI 작업' }).getByRole('button', { name: '구체화' }).click();
      await body.getByRole('link', { name: 'Electron 문서' }).waitFor({ timeout: 10_000 });
      expect(await body.textContent()).toContain('Chromium과 Node.js를 기반으로');
      expect(await body.textContent()).toContain('출처');
      if (shots) await page.screenshot({ path: `${shots}/scenario-3.png` });

      // Scenario 4: 시각화 → 원문 아래 인포그래픽 → PNG 저장
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('노트를 쓰면 AI가 분석해 결과를 만든다');
      await selectText(page, '노트를 쓰면 AI가 분석해 결과를 만든다');
      await page.getByRole('toolbar', { name: 'AI 작업' }).getByRole('button', { name: '시각화' }).click();
      const figure = page.getByRole('figure', { name: '처리 과정' });
      await figure.waitFor({ timeout: 10_000 });
      expect(await body.textContent()).toContain('노트를 쓰면 AI가 분석해 결과를 만든다');
      // 인포그래픽은 선택한 텍스트만으로 만들어진다 (가짜 LLM은 입력 앞부분을 첫 노드 설명에 쓴다)
      expect(await figure.textContent()).toContain('노트를 쓰면');
      expect(await figure.textContent()).not.toContain('문서');
      await figure.hover();
      if (shots) await page.screenshot({ path: `${shots}/scenario-4.png` });

      await figure.getByRole('button', { name: 'PNG로 저장' }).click();
      await page.getByText('PNG로 저장했습니다').waitFor();
      expect(existsSync(pngPath)).toBe(true);
      const bytes = readFileSync(pngPath);
      expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(500); // IHDR width (2x 배율)
      if (shots) copyFileSync(pngPath, `${shots}/scenario-4-export.png`);
    } finally {
      await app.close();
    }
  });
});
