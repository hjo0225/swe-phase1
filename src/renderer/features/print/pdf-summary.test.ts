import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_OPTIONS } from '../../../shared/print/pdf-options';
import { summarizePdf } from './pdf-summary';

describe('summarizePdf', () => {
  it('reads like "1 page · A4 portrait · 82%"', () => {
    expect(summarizePdf(DEFAULT_PDF_OPTIONS, { pages: 1, scale: 0.823 })).toBe('1 page · A4 portrait · 82%');
  });

  it('counts pages in the plural and names the paper', () => {
    expect(summarizePdf({ ...DEFAULT_PDF_OPTIONS, pageSize: 'Letter', orientation: 'landscape' }, { pages: 3, scale: 1 })).toBe(
      '3 pages · Letter landscape · 100%',
    );
  });
});
