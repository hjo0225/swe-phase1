import { describe, expect, it } from 'vitest';
import { A4_PRINT } from './page-fit';
import { DEFAULT_PDF_OPTIONS, pageCount, pageGeometry, parsePrintQuery, toPrintQuery, type PdfExportOptions } from './pdf-options';

const px = (mm: number) => (mm / 25.4) * 96;

describe('pageGeometry', () => {
  it('matches the A4 portrait page with a 12 mm margin by default', () => {
    const page = pageGeometry(DEFAULT_PDF_OPTIONS);
    expect(page.pageWidthPx).toBeCloseTo(px(210));
    expect(page.pageHeightPx).toBeCloseTo(px(297));
    expect(page.marginPx).toBeCloseTo(px(12));
    expect(page.printableWidthPx).toBeCloseTo(A4_PRINT.printableWidthPx);
    expect(page.printableHeightPx).toBeCloseTo(A4_PRINT.printableHeightPx);
    expect(page.marginInches).toBeCloseTo(12 / 25.4);
  });

  it('swaps width and height for landscape', () => {
    const page = pageGeometry({ ...DEFAULT_PDF_OPTIONS, pageSize: 'Letter', orientation: 'landscape' });
    expect(page.pageWidthPx).toBeCloseTo(px(279.4));
    expect(page.pageHeightPx).toBeCloseTo(px(215.9));
    expect(page.printableWidthPx).toBeCloseTo(px(279.4 - 24));
  });

  it('uses 6 mm for a small margin and nothing for none', () => {
    expect(pageGeometry({ ...DEFAULT_PDF_OPTIONS, pageSize: 'A3', margin: 'small' }).printableWidthPx).toBeCloseTo(px(297 - 12));
    const none = pageGeometry({ ...DEFAULT_PDF_OPTIONS, margin: 'none' });
    expect(none.printableWidthPx).toBeCloseTo(none.pageWidthPx);
    expect(none.marginInches).toBe(0);
  });
});

describe('print query', () => {
  it('round-trips every option', () => {
    const options: PdfExportOptions = { pageSize: 'Letter', orientation: 'landscape', margin: 'none', includeTitle: false, fitToOnePage: true, columns: 2 };
    expect(parsePrintQuery(new URLSearchParams(toPrintQuery(options)))).toEqual(options);
  });

  it('leaves the title out when it is automatic', () => {
    const query = toPrintQuery(DEFAULT_PDF_OPTIONS);
    expect(new URLSearchParams(query).has('title')).toBe(false);
    expect(parsePrintQuery(new URLSearchParams(query))).toEqual(DEFAULT_PDF_OPTIONS);
  });

  it('falls back to the defaults for missing or unknown values', () => {
    expect(parsePrintQuery(new URLSearchParams('size=B5&orientation=sideways&margin=huge&fit=maybe&cols=3'))).toEqual(DEFAULT_PDF_OPTIONS);
  });

  it('prints one column whenever the note may run over several pages', () => {
    expect(parsePrintQuery(new URLSearchParams('fit=0&cols=2')).columns).toBe(1);
    expect(parsePrintQuery(new URLSearchParams('fit=1&cols=2')).columns).toBe(2);
  });
});

describe('pageCount', () => {
  it('counts started pages and never less than one', () => {
    expect(pageCount(0, 1000)).toBe(1);
    expect(pageCount(1000, 1000)).toBe(1);
    expect(pageCount(1001, 1000)).toBe(2);
    expect(pageCount(2500, 1000)).toBe(3);
  });
});
