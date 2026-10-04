import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';

/**
 * 포스터의 Key Features처럼 기능 노트 여러 개를 한 섹션 아래 이어서 가져온다.
 * 앞 노트가 목록으로 끝나도 다음 노트가 그 목록 안으로 들어가거나, 노트 사이에 빈 줄이 남으면 안 된다.
 */
describe('Import several notes in a row under one section', () => {
  let userData: ReturnType<typeof createUserDataDir>;
  beforeEach(() => {
    userData = createUserDataDir();
    writeFileSync(join(userData.vault, 'Feature A.md'), '#### A title\n\n- a one\n- a two\n');
    writeFileSync(join(userData.vault, 'Feature B.md'), '#### B title\n\n- b one\n');
    writeFileSync(join(userData.vault, 'Feature C.md'), '#### C title\n\n- c one\n');
    writeFileSync(join(userData.vault, 'Poster.md'), '### Key Features\n\n### Next section\n');
  });
  afterEach(() => userData.cleanup());

  it('keeps every imported note at the top level, side by side, with no empty lines left between', async () => {
    const { app, page } = await launchApp(userData.dir);
    try {
      await page.getByRole('region', { name: 'Note list' }).getByRole('link', { name: 'Poster', exact: true }).click();
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.getByText('Key Features').click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      for (const title of ['Feature A', 'Feature B', 'Feature C']) {
        await page.keyboard.press('Control+k');
        const palette = page.getByRole('dialog', { name: 'Search notes' });
        await palette.getByRole('searchbox', { name: 'Search query' }).fill(title);
        await palette.getByRole('article', { name: title }).getByRole('button', { name: 'Import' }).click();
        await palette.waitFor({ state: 'detached' });
      }
      // 자동 저장이 끝나 파일이 화면의 내용과 같아질 때까지
      const shown = await page.evaluate(
        () => (document.querySelector('[aria-label="Note body"]') as unknown as { editor: { getMarkdown(): string } }).editor.getMarkdown(),
      );
      await expect
        .poll(() => readFileSync(join(userData.vault, 'Poster.md'), 'utf8').trimEnd(), { timeout: 10_000 })
        .toBe(shown.trimEnd());
      const saved = readFileSync(join(userData.vault, 'Poster.md'), 'utf8');
      // 노트들은 맨 바깥에 차례로, 사이에 빈 줄 없이 들어간다
      expect(saved.slice(0, saved.indexOf('- c one') + '- c one'.length)).toBe(
        '### Key Features\n\n#### A title\n\n- a one\n- a two\n\n#### B title\n\n- b one\n\n#### C title\n\n- c one',
      );
      // 커서는 마지막 노트 아래 새 줄(빈 단락)에 남고, 그 뒤에 원래 다음 섹션이 온다
      expect(saved.indexOf('### Next section')).toBeGreaterThan(saved.indexOf('- c one'));
    } finally {
      await app.close();
    }
  });
});
