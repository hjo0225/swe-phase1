import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RawBlinkApi } from '../src/shared/ipc/blink-api';
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

/** 노트를 열고 Export PDF → 미리보기 창에서 설정을 고르고(choose) → Export. 미리보기의 요약 줄을 돌려준다 */
async function exportOpenNote(page: Page, title: string, choose?: (dialog: Locator) => Promise<void>): Promise<string> {
  await page.getByRole('region', { name: 'Note list' }).getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { name: '연구 개요' }).waitFor();
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export PDF' });
  await choose?.(dialog);
  const summary = dialog.getByText(/^\d+ pages? · /);
  await summary.waitFor({ timeout: 30_000 });
  const text = (await summary.textContent()) ?? '';
  if (process.env.BLINK_E2E_SHOTS) await page.screenshot({ path: `${process.env.BLINK_E2E_SHOTS}/export-dialog-${title}.png` });
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  return text;
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
      const summary = await exportOpenNote(page, '긴 포스터');
      await expect
        .poll(() => existsSync(pdfPath) && readFileSync(pdfPath).subarray(-16).toString('latin1').includes('%%EOF'), { timeout: 30_000 })
        .toBe(true);
      expect(pdfPageCount(readFileSync(pdfPath))).toBe(1);
      expect(await page.getByText(/bottom was cut off/).count()).toBe(0);
      // 줄였지만 잘리지 않았다 (Main이 넓게 다시 배치해 종이 폭을 채우는 배율)
      const noteId = await page.evaluate(() => location.hash.split('/').pop()!);
      const result = await page.evaluate(
        (id) => (window as unknown as { blink: RawBlinkApi }).blink.notes.exportPdf({ id }),
        noteId,
      );
      expect(result).toMatchObject({ ok: true, data: { saved: true, clipped: false } });
      const { scale } = (result as { data: { scale: number } }).data;
      expect(scale).toBeGreaterThan(0.1);
      expect(scale).toBeLessThan(1);
      expect(pdfPageCount(readFileSync(pdfPath))).toBe(1);
      // 미리보기가 PDF와 같은 배율을 보여 준다
      const previewPercent = Number(/(\d+)%$/.exec(summary)?.[1]);
      expect(summary).toMatch(/^1 page · A4 portrait · /);
      expect(Math.abs(previewPercent - scale * 100)).toBeLessThanOrEqual(2);
      if (process.env.BLINK_E2E_SHOTS) copyFileSync(pdfPath, `${process.env.BLINK_E2E_SHOTS}/long-poster.pdf`);
    } finally {
      await app.close();
    }
  });

  it('exports with the page settings chosen in the preview — Letter landscape over several pages', async () => {
    writeFileSync(join(userData.vault, '긴 포스터.md'), posterMarkdown(14));
    const pdfPath = join(userData.dir, 'letter.pdf');
    const { app, page } = await launchApp(userData.dir, { BLINK_E2E_PDF_PATH: pdfPath });
    try {
      const summary = await exportOpenNote(page, '긴 포스터', async (dialog) => {
        await dialog.getByRole('radio', { name: 'Letter' }).click();
        await dialog.getByRole('radio', { name: 'Landscape' }).click();
        await dialog.getByRole('switch', { name: 'Fit to one page' }).click();
      });
      await page.getByText('Saved as PDF', { exact: true }).waitFor({ timeout: 30_000 });
      const pdf = readFileSync(pdfPath);
      const [width, height] = pdfMediaBox(pdf) ?? [0, 0];
      expect(width).toBeCloseTo(792, -1); // Letter 가로 = 792 × 612 pt
      expect(height).toBeCloseTo(612, -1);
      const pages = pdfPageCount(pdf);
      expect(pages).toBeGreaterThan(1);
      // 미리보기의 장 수는 근사다 (Chromium은 줄 중간에서 자르지 않으려고 조금 일찍 넘긴다)
      const previewPages = Number(/^(\d+) pages? · Letter landscape · 100%$/.exec(summary)?.[1]);
      expect(Math.abs(previewPages - pages)).toBeLessThanOrEqual(1);
      if (process.env.BLINK_E2E_SHOTS) copyFileSync(pdfPath, `${process.env.BLINK_E2E_SHOTS}/letter-landscape.pdf`);
    } finally {
      await app.close();
    }
  });

  it('previews and exports a poster whose architecture diagram is laid out asynchronously', async () => {
    const layers = {
      version: 1,
      type: 'architecture',
      title: 'Blink Architecture',
      groups: [
        { id: 'g1', title: 'Screen' },
        { id: 'g2', title: 'Main' },
        { id: 'g3', title: 'Resources' },
      ],
      nodes: [
        { id: '1', title: 'React 19.3', group: 'g1', icon: 'client' },
        { id: '2', title: 'Tiptap 3.31', group: 'g1' },
        { id: '3', title: 'Electron 44.4', group: 'g2', icon: 'container' },
        { id: '4', title: 'Markdown files', group: 'g3', icon: 'storage' },
        { id: '5', title: 'SQLite 3.53', group: 'g3', icon: 'database' },
      ],
      edges: [
        ['g1', 'g2', { label: 'preload / ipc' }],
        ['g2', 'g3'],
      ],
    };
    const markdown = posterMarkdown().replace('## 결과', ['```blink-infographic', JSON.stringify(layers), '```', '', '## 결과'].join('\n'));
    writeFileSync(join(userData.vault, '구조 포스터.md'), markdown);
    const pdfPath = join(userData.dir, 'architecture.pdf');
    const { app, page } = await launchApp(userData.dir, { BLINK_E2E_PDF_PATH: pdfPath });
    try {
      await exportOpenNote(page, '구조 포스터', async (dialog) => {
        // 요약이 나온 순간(측정이 끝난 뒤) 미리보기의 그림은 층 상자와 카드까지 다 그려져 있다
        await dialog.getByText(/^1 page · /).waitFor({ timeout: 30_000 });
        const figure = dialog.locator('figure[aria-label="Blink Architecture"]');
        expect(await figure.locator('[data-card]').count()).toBe(5);
        expect(await figure.getAttribute('data-print-busy')).toBeNull();
      });
      await page.getByText('Saved as PDF', { exact: true }).waitFor({ timeout: 30_000 });
      expect(pdfPageCount(readFileSync(pdfPath))).toBe(1);
      if (process.env.BLINK_E2E_SHOTS) copyFileSync(pdfPath, `${process.env.BLINK_E2E_SHOTS}/architecture-poster.pdf`);
    } finally {
      await app.close();
    }
  });
});
