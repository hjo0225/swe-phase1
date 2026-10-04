import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUserDataDir, launchApp } from './support/app';
import { pdfMediaBox, pdfPageCount } from './support/pdf';

const SCREENSHOT = resolve(__dirname, '../docs/images/screen-1.png');

const SPEC = {
  version: 1,
  type: 'process',
  title: '연구 절차',
  nodes: [
    { id: 'n1', title: '질문', description: '수업 주제에서 질문을 고른다' },
    { id: 'n2', title: '조사', description: '자료를 모아 정리한다' },
    { id: 'n3', title: '발표', description: '포스터 한 장으로 정리한다' },
  ],
  edges: [
    ['n1', 'n2'],
    ['n2', 'n3'],
  ],
};

/** 수업 포스터처럼: 제목, 문단, 목록, 보관함 그림 두 장, 인포그래픽 하나 */
function posterMarkdown(extraParagraphs = 0): string {
  const filler = Array.from(
    { length: extraParagraphs },
    (_, i) => `## 추가 절 ${i + 1}\n\n이 문단은 포스터가 한 장보다 길 때 고르게 줄어드는지 확인하려고 넣었다. Blink는 노트를 A4 한 장에 맞춘다.`,
  );
  return [
    '# 연구 개요',
    '',
    '이 포스터는 **Blink** 노트로 만들었다. 제목, 본문, 그림, 인포그래픽이 한 장에 들어간다.',
    '',
    '## 방법',
    '',
    '- 질문을 고른다',
    '- 자료를 모은다',
    '- 결과를 정리한다',
    '',
    '![첫 화면](images/screen-1.png)',
    '',
    '```blink-infographic',
    JSON.stringify(SPEC, null, 2),
    '```',
    '',
    '## 결과',
    '',
    '> 한 장짜리 포스터로 제출한다.',
    '',
    '![둘째 화면](images/screen-2.png)',
    '',
    ...filler.flatMap((p) => [p, '']),
    '끝.',
  ].join('\n');
}

async function exportOpenNote(page: Page, title: string) {
  await page.getByRole('region', { name: 'Note list' }).getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { name: '연구 개요' }).waitFor();
  await page.getByRole('button', { name: 'Export PDF' }).click();
}

describe('Export a note as a one-page A4 PDF', () => {
  let userData: ReturnType<typeof createUserDataDir>;
  beforeEach(() => {
    userData = createUserDataDir();
    mkdirSync(join(userData.vault, 'images'));
    copyFileSync(SCREENSHOT, join(userData.vault, 'images', 'screen-1.png'));
    copyFileSync(resolve(__dirname, '../docs/images/screen-2.png'), join(userData.vault, 'images', 'screen-2.png'));
  });
  afterEach(() => userData.cleanup());

  it('exports a poster with images and an infographic to exactly one A4 page, also when it is longer than a page', async () => {
    writeFileSync(join(userData.vault, '수업 포스터.md'), posterMarkdown());
    writeFileSync(join(userData.vault, '긴 포스터.md'), posterMarkdown(14));
    const pdfPath = join(userData.dir, 'poster.pdf');
    const { app, page } = await launchApp(userData.dir, { BLINK_E2E_PDF_PATH: pdfPath });
    try {
      await exportOpenNote(page, '수업 포스터');
      await page.getByText('Saved as PDF', { exact: true }).waitFor({ timeout: 30_000 });
      const pdf = readFileSync(pdfPath);
      expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
      expect(pdfPageCount(pdf)).toBe(1);
      const [width, height] = pdfMediaBox(pdf) ?? [0, 0];
      expect(width).toBeCloseTo(595, -1); // A4 세로 = 595 × 842 pt
      expect(height).toBeCloseTo(842, -1);
      if (process.env.BLINK_E2E_SHOTS) copyFileSync(pdfPath, `${process.env.BLINK_E2E_SHOTS}/poster.pdf`);

      // 인쇄 창은 끝나면 없어진다
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

      // 한 장보다 긴 노트도 (잘리지 않고) 고르게 줄여서 한 장
      rmSync(pdfPath);
      await exportOpenNote(page, '긴 포스터');
      await expect
        .poll(() => existsSync(pdfPath) && readFileSync(pdfPath).subarray(-16).toString('latin1').includes('%%EOF'), { timeout: 30_000 })
        .toBe(true);
      expect(pdfPageCount(readFileSync(pdfPath))).toBe(1);
      expect(await page.getByText(/bottom was cut off/).count()).toBe(0);
      if (process.env.BLINK_E2E_SHOTS) copyFileSync(pdfPath, `${process.env.BLINK_E2E_SHOTS}/long-poster.pdf`);
    } finally {
      await app.close();
    }
  });
});
