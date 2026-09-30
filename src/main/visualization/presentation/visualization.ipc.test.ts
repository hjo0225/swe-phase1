import { describe, expect, it } from 'vitest';
import { ExportInfographicPng } from '../application/export-infographic-png';
import { visualizationIpcHandlers } from './visualization.ipc';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe('visualizationIpcHandlers', () => {
  const written: string[] = [];
  const handlers = visualizationIpcHandlers(
    new ExportInfographicPng({
      askSavePath: async (name) => `/tmp/${name}`,
      write: async (path) => {
        written.push(path);
      },
    }),
  );
  const call = (request: unknown) => handlers['visualization:save-png']!(request);

  it('saves binary PNG data sent over IPC', async () => {
    await expect(call({ png, suggestedFileName: '흐름' })).resolves.toEqual({
      ok: true,
      data: { saved: true, filePath: '/tmp/흐름.png' },
    });
    expect(written).toEqual(['/tmp/흐름.png']);
  });

  it('rejects non-binary payloads at the transport boundary', async () => {
    await expect(call({ png: [1, 2, 3] })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('maps domain errors', async () => {
    await expect(call({ png: new Uint8Array([1]) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'EXPORT_INVALID_IMAGE' },
    });
  });
});
