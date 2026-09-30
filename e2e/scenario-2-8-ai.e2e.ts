import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';

/** 실제 편집기(Tiptap) 인스턴스로 텍스트를 선택한다 — 마우스 드래그보다 안정적이다. */
async function selectText(page: Page, target: string) {
  await page.evaluate((text) => {
    const dom = document.querySelector('[aria-label="노트 본문"]') as HTMLElement & {
      editor: { state: { doc: { textContent: string } }; commands: { focus(): void; setTextSelection(r: object): void } };
    };
    const from = 1 + dom.editor.state.doc.textContent.indexOf(text);
    dom.editor.commands.focus();
    dom.editor.commands.setTextSelection({ from, to: from + text.length });
  }, target);
}

// 명세서 §41 Scenario 8(AI Provider 설정) · Scenario 2(정리: Pulse 중 다른 부분 계속 작성 → 한 번에 적용)
describe('Scenarios 8 & 2: AI settings and organize', () => {
  let userData: ReturnType<typeof createUserDataDir>;
  beforeEach(() => {
    userData = createUserDataDir();
  });
  afterEach(() => userData.cleanup());

  it('configures the provider, then organizes a selection while the user keeps writing', async () => {
    const { app, page } = await launchApp(userData.dir, { BLINK_FAKE_LLM: '1' });
    const shots = process.env.BLINK_E2E_SHOTS;
    try {
      // Scenario 8: Settings → Key 입력 → 모델 선택 → 연결 테스트 → 저장
      await page.getByRole('link', { name: '설정' }).click();
      const form = page.getByRole('form', { name: 'AI 설정' });
      await form.getByRole('combobox', { name: '모델' }).selectOption('gpt-5.4-mini');
      await form.getByLabel('API Key').fill('sk-e2e-test');
      await form.getByRole('button', { name: '연결 테스트' }).click();
      await form.getByText('연결되었습니다').waitFor();
      await form.getByRole('button', { name: '저장' }).click();
      await page.getByText('OpenAI · GPT-5.4 mini (권장)').waitFor();
      if (shots) await page.screenshot({ path: `${shots}/scenario-8.png` });

      // Scenario 2: 텍스트 선택 → 정리 → Pulse → 다른 부분 작성 → 결과 한 번에 적용
      await page.getByRole('button', { name: '새 노트' }).first().click();
      await page.getByRole('textbox', { name: '노트 제목' }).fill('회의');
      const body = page.getByRole('textbox', { name: '노트 본문' });
      await body.click();
      await page.keyboard.type('회의했고 api 어떤거 쓸지도 얘기했고 electron 쓸 거 같음');
      await page.keyboard.press('Enter');
      await page.keyboard.type('다음 줄');

      await selectText(page, '회의했고 api 어떤거 쓸지도 얘기했고 electron 쓸 거 같음');
      await page.getByRole('toolbar', { name: 'AI 작업' }).getByRole('button', { name: '정리' }).click();
      await page.locator('.ai-processing').waitFor();
      if (shots) await page.screenshot({ path: `${shots}/scenario-2-pulse.png` });

      // 처리 중에도 다른 문단은 계속 편집할 수 있다
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' 계속 작성');
      await expect.poll(() => body.textContent()).toContain('다음 줄 계속 작성');

      await page.getByRole('heading', { name: '정리된 메모' }).waitFor({ timeout: 10_000 });
      expect(await page.locator('.ai-processing').count()).toBe(0);
      expect(await body.textContent()).toContain('다음 줄 계속 작성');
      if (shots) await page.screenshot({ path: `${shots}/scenario-2-done.png` });
    } finally {
      await app.close();
    }
  });
});
