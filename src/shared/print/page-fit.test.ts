import { describe, expect, it } from 'vitest';
import { A4_PRINT, fitToOnePage, MIN_PDF_SCALE } from './page-fit';

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
