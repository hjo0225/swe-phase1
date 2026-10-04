import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../platform/errors';
import { ExportNotePdf } from '../application/export-note-pdf';
import { noteExportIpcHandlers } from './note-export.ipc';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';

describe('noteExportIpcHandlers', () => {
  const render = vi.fn(async (_id: string, _options: unknown) => ({ pdf: new TextEncoder().encode('%PDF-1.7'), scale: 1, clipped: false }));
  const handlers = noteExportIpcHandlers(
    new ExportNotePdf({
      notes: {
        get: (id) => {
          if (id !== NOTE_ID) throw new DomainError('NOTE_NOT_FOUND', 'Note not found');
          return { title: '포스터' };
        },
      },
      files: { askSavePath: async (name) => `/tmp/${name}`, write: async () => undefined },
      renderer: { render },
    }),
  );
  const call = (request: unknown) => handlers['note:export-pdf']!(request);

  it('exports the note to the path picked in the dialog', async () => {
    await expect(call({ id: NOTE_ID })).resolves.toEqual({
      ok: true,
      data: { saved: true, filePath: '/tmp/포스터.pdf', scale: 1, clipped: false },
    });
  });

  it('passes the page settings to the renderer', async () => {
    render.mockClear();
    const options = { pageSize: 'A3', orientation: 'portrait', margin: 'small', includeTitle: true, fitToOnePage: false };
    await expect(call({ id: NOTE_ID, options })).resolves.toMatchObject({ ok: true });
    expect(render).toHaveBeenCalledWith(NOTE_ID, options);
  });

  it('rejects unknown page settings', async () => {
    render.mockClear();
    const good = { pageSize: 'A4', orientation: 'portrait', margin: 'default', fitToOnePage: true };
    for (const options of [{ ...good, pageSize: 'B5' }, { ...good, margin: 3 }, { ...good, fitToOnePage: undefined }, { ...good, path: 'x' }]) {
      await expect(call({ id: NOTE_ID, options })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
    expect(render).not.toHaveBeenCalled();
  });

  it('accepts only a note id and page settings — no paths, file names or extra fields from the renderer', async () => {
    render.mockClear();
    for (const request of [{}, { id: 'not-a-uuid' }, { id: NOTE_ID, filePath: 'C:/Windows/evil.pdf' }, null]) {
      await expect(call(request)).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
    expect(render).not.toHaveBeenCalled();
  });

  it('maps domain errors', async () => {
    await expect(call({ id: '22222222-2222-4222-8222-222222222222' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOTE_NOT_FOUND' },
    });
  });
});
