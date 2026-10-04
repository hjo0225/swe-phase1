import { describe, expect, it, vi } from 'vitest';
import { A4_PRINT, fitToOnePage, fitToPageWidth, MIN_PDF_SCALE } from './page-fit';

describe('A4_PRINT', () => {
  it('describes A4 portrait with 12 mm margins in CSS px (96 per inch) and inches', () => {
    expect(A4_PRINT.marginInches).toBeCloseTo(12 / 25.4, 6);
    expect(A4_PRINT.printableWidthPx).toBeCloseTo((186 / 25.4) * 96, 3); // ≈ 703 px
    expect(A4_PRINT.printableHeightPx).toBeCloseTo((273 / 25.4) * 96, 3); // ≈ 1032 px
  });
});

describe('fitToOnePage', () => {
  const page = A4_PRINT.printableHeightPx;

  it('keeps notes that fit at 100%', () => {
    expect(fitToOnePage(400)).toEqual({ scale: 1, clipped: false });
    expect(fitToOnePage(page * 0.95)).toEqual({ scale: 1, clipped: false });
  });

  it('shrinks taller notes uniformly so they end inside the page with a little headroom', () => {
    const { scale, clipped } = fitToOnePage(page * 2);
    expect(clipped).toBe(false);
    expect(scale).toBeLessThan(0.5);
    expect(scale).toBeGreaterThan(0.45);
    expect(page * 2 * scale).toBeLessThanOrEqual(page * 0.98 + 0.01);
  });

  it('also shrinks a note that is only just taller than the usable height', () => {
    const { scale } = fitToOnePage(page);
    expect(scale).toBeLessThan(1);
    expect(page * scale).toBeLessThan(page);
  });

  it('stops at the smallest scale Chromium allows and reports that the bottom is cut', () => {
    expect(fitToOnePage(page * 40)).toEqual({ scale: MIN_PDF_SCALE, clipped: true });
    expect(MIN_PDF_SCALE).toBe(0.1);
  });

  it('treats empty or broken measurements as a short note', () => {
    expect(fitToOnePage(0)).toEqual({ scale: 1, clipped: false });
    expect(fitToOnePage(Number.NaN)).toEqual({ scale: 1, clipped: false });
  });
});

describe('fitToPageWidth', () => {
  const { printableWidthPx: pageWidth, printableHeightPx: pageHeight } = A4_PRINT;
  const usable = pageHeight * 0.98;
  /** 글: 넓게 배치할수록 줄 수가 줄어 높이가 폭에 반비례한다 (면적 일정) */
  const textOf = (heightAtPageWidth: number) => (width: number) => (heightAtPageWidth * pageWidth) / width;

  it('measures once and keeps 100% when the note fits', async () => {
    const measure = vi.fn(async () => 600);
    await expect(fitToPageWidth(measure)).resolves.toEqual({ scale: 1, clipped: false, layoutWidthPx: pageWidth });
    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenCalledWith(pageWidth);
  });

  it('lays a tall note out wider and scales it back down so it fills the page width and still fits the height', async () => {
    const text = textOf(2000);
    const measure = vi.fn(async (width: number) => text(width));
    const { scale, clipped, layoutWidthPx } = await fitToPageWidth(measure);

    expect(clipped).toBe(false);
    expect(layoutWidthPx * scale).toBeCloseTo(pageWidth, 1); // 인쇄하면 인쇄 영역 폭을 꽉 채운다
    expect(text(layoutWidthPx) * scale).toBeLessThanOrEqual(usable); // 한 장에 들어간다
    // 정답 √(usable/2000) ≈ 0.711에 0.01 안으로 다가가고, 폭을 그대로 둔 채 줄일 때(≈0.505)보다 크다
    expect(scale).toBeGreaterThan(Math.sqrt(usable / 2000) - 0.01);
    expect(scale).toBeGreaterThan(fitToOnePage(2000).scale + 0.15);
    expect(measure.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it('falls back to shrinking at the page width when widening cannot help (content grows with the width)', async () => {
    // 폭을 따라 커지는 그림만 있는 노트: 넓혀도 인쇄 높이가 줄지 않는다
    const measure = async (width: number) => width * 2;
    await expect(fitToPageWidth(measure)).resolves.toEqual({ ...fitToOnePage(pageWidth * 2), layoutWidthPx: pageWidth });
  });

  it('keeps the 0.1 minimum and reports clipping for extremely long notes', async () => {
    const measure = async (width: number) => textOf(pageHeight * 2000)(width);
    await expect(fitToPageWidth(measure)).resolves.toEqual({ scale: MIN_PDF_SCALE, clipped: true, layoutWidthPx: pageWidth });
  });
});
