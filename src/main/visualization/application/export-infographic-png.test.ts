import { describe, expect, it, vi } from 'vitest';
import { ExportInfographicPng, sanitizeFileName, type FileSaver } from './export-infographic-png';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 16) => {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_SIGNATURE);
  return bytes;
};

function saver(path: string | null) {
  return {
    askSavePath: vi.fn<FileSaver['askSavePath']>().mockResolvedValue(path),
    write: vi.fn<FileSaver['write']>().mockResolvedValue(),
  };
}

describe('ExportInfographicPng', () => {
  it('asks where to save with a sanitized default name and writes the bytes there', async () => {
    const files = saver('C:/Users/me/Downloads/회의 흐름.png');
    const result = await new ExportInfographicPng(files).execute({ png: png(), suggestedFileName: '회의: 흐름?' });
    expect(files.askSavePath).toHaveBeenCalledWith('회의 흐름.png');
    expect(files.write).toHaveBeenCalledWith('C:/Users/me/Downloads/회의 흐름.png', expect.any(Uint8Array));
    expect(result).toEqual({ saved: true, filePath: 'C:/Users/me/Downloads/회의 흐름.png' });
  });

  it('treats a cancelled dialog as not saved, not as an error', async () => {
    const files = saver(null);
    await expect(new ExportInfographicPng(files).execute({ png: png() })).resolves.toEqual({ saved: false });
    expect(files.write).not.toHaveBeenCalled();
  });

  it('rejects non-PNG bytes and oversized images before asking', async () => {
    const files = saver('x.png');
    await expect(new ExportInfographicPng(files).execute({ png: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({
      code: 'EXPORT_INVALID_IMAGE',
    });
    await expect(new ExportInfographicPng(files).execute({ png: png(20 * 1024 * 1024 + 1) })).rejects.toMatchObject({
      code: 'EXPORT_TOO_LARGE',
    });
    expect(files.askSavePath).not.toHaveBeenCalled();
  });

  it('maps write failures to EXPORT_WRITE_FAILED', async () => {
    const files = saver('x.png');
    files.write.mockRejectedValue(new Error('EACCES'));
    await expect(new ExportInfographicPng(files).execute({ png: png() })).rejects.toMatchObject({
      code: 'EXPORT_WRITE_FAILED',
    });
  });
});

describe('sanitizeFileName', () => {
  it('removes characters Windows and macOS reject and falls back to a default', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.png');
    expect(sanitizeFileName('   ')).toBe('infographic.png');
    expect(sanitizeFileName(undefined)).toBe('infographic.png');
    expect(sanitizeFileName('흐름.png')).toBe('흐름.png');
  });
});
