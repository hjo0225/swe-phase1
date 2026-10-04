import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PDF_OPTIONS } from '../../../shared/print/pdf-options';
import { DomainError } from '../../platform/errors';
import { ExportNotePdf, pdfFileName, type NotePdfRenderer, type PdfFileSaver } from './export-note-pdf';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const pdfBytes = () => new TextEncoder().encode('%PDF-1.4\n%fake\n');

function setup(options: { path?: string | null; title?: string } = {}) {
  const files = {
    askSavePath: vi.fn<PdfFileSaver['askSavePath']>().mockResolvedValue(options.path === undefined ? 'C:/Downloads/포스터.pdf' : options.path),
    write: vi.fn<PdfFileSaver['write']>().mockResolvedValue(),
  };
  const renderer = { render: vi.fn<NotePdfRenderer['render']>().mockResolvedValue({ pdf: pdfBytes(), scale: 0.8, clipped: false }) };
  const notes = {
    get: vi.fn((id: string) => {
      if (id !== NOTE_ID) throw new DomainError('NOTE_NOT_FOUND', 'Note not found');
      return { title: options.title ?? '포스터' };
    }),
  };
  return { files, renderer, notes, exportPdf: new ExportNotePdf({ notes, files, renderer }) };
}

describe('ExportNotePdf', () => {
  it('asks where to save (named after the note), renders the note and writes the PDF there', async () => {
    const { files, renderer, exportPdf } = setup();
    await expect(exportPdf.execute({ id: NOTE_ID })).resolves.toEqual({
      saved: true,
      filePath: 'C:/Downloads/포스터.pdf',
      scale: 0.8,
      clipped: false,
    });
    expect(files.askSavePath).toHaveBeenCalledWith('포스터.pdf');
    expect(renderer.render).toHaveBeenCalledWith(NOTE_ID, DEFAULT_PDF_OPTIONS);
    expect(files.write).toHaveBeenCalledWith('C:/Downloads/포스터.pdf', expect.any(Uint8Array));
  });

  it('renders with the chosen page settings', async () => {
    const { renderer, exportPdf } = setup();
    const options = { pageSize: 'Letter' as const, orientation: 'landscape' as const, margin: 'none' as const, includeTitle: false, fitToOnePage: false, columns: 1 as const };
    await exportPdf.execute({ id: NOTE_ID, options });
    expect(renderer.render).toHaveBeenCalledWith(NOTE_ID, options);
  });

  it('treats a cancelled dialog as not saved and does not render', async () => {
    const { renderer, files, exportPdf } = setup({ path: null });
    await expect(exportPdf.execute({ id: NOTE_ID })).resolves.toEqual({ saved: false });
    expect(renderer.render).not.toHaveBeenCalled();
    expect(files.write).not.toHaveBeenCalled();
  });

  it('rejects unknown notes before asking', async () => {
    const { files, exportPdf } = setup();
    await expect(exportPdf.execute({ id: '22222222-2222-4222-8222-222222222222' })).rejects.toMatchObject({
      code: 'NOTE_NOT_FOUND',
    });
    expect(files.askSavePath).not.toHaveBeenCalled();
  });

  it('maps rendering failures and non-PDF output to EXPORT_RENDER_FAILED without writing', async () => {
    const { renderer, files, exportPdf } = setup();
    renderer.render.mockRejectedValueOnce(new Error('print window crashed'));
    await expect(exportPdf.execute({ id: NOTE_ID })).rejects.toMatchObject({ code: 'EXPORT_RENDER_FAILED' });
    renderer.render.mockResolvedValueOnce({ pdf: new Uint8Array([1, 2, 3]), scale: 1, clipped: false });
    await expect(exportPdf.execute({ id: NOTE_ID })).rejects.toMatchObject({ code: 'EXPORT_RENDER_FAILED' });
    expect(files.write).not.toHaveBeenCalled();
  });

  it('maps write failures to EXPORT_WRITE_FAILED', async () => {
    const { files, exportPdf } = setup();
    files.write.mockRejectedValue(new Error('EACCES'));
    await expect(exportPdf.execute({ id: NOTE_ID })).rejects.toMatchObject({ code: 'EXPORT_WRITE_FAILED' });
  });
});

describe('pdfFileName', () => {
  it('uses the note title without characters file systems reject, with a fallback', () => {
    expect(pdfFileName('회의: 흐름?')).toBe('회의 흐름.pdf');
    expect(pdfFileName('a/b\c*d"e<f>g|h')).toBe('abcdefgh.pdf');
    expect(pdfFileName('   ')).toBe('note.pdf');
    expect(pdfFileName('report.pdf')).toBe('report.pdf');
  });
});
