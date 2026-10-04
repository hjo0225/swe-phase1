import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_OPTIONS, parsePrintQuery } from './pdf-options';
import { printRoutePath } from './print-page';

describe('printRoutePath', () => {
  it('is the bare note route without options', () => {
    expect(printRoutePath('a b')).toBe('/print/a%20b');
  });

  it('carries the print options in the query', () => {
    const options = { ...DEFAULT_PDF_OPTIONS, pageSize: 'A3' as const, includeTitle: false };
    const path = printRoutePath('n1', options);
    expect(path.startsWith('/print/n1?')).toBe(true);
    expect(parsePrintQuery(new URLSearchParams(path.split('?')[1]))).toEqual(options);
  });
});
