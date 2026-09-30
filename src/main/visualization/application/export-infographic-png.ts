import { DomainError } from '../../platform/errors';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_NAME = 'infographic.png';

/** 저장 위치는 항상 사용자가 Main의 Dialog에서 고른다 — Renderer가 임의 경로에 쓸 수 없게 한다. */
export interface FileSaver {
  /** 취소하면 null */
  askSavePath(defaultFileName: string): Promise<string | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

export type SavePngResult = { saved: true; filePath: string } | { saved: false };

/** UC-VIS-001. PNG 래스터화는 Renderer가 하고, 여기서는 확인·Dialog·쓰기만 한다. */
export class ExportInfographicPng {
  constructor(private readonly files: FileSaver) {}

  async execute(input: { png: Uint8Array; suggestedFileName?: string }): Promise<SavePngResult> {
    if (input.png.byteLength > MAX_BYTES) throw new DomainError('EXPORT_TOO_LARGE', 'Image exceeds 20 MB');
    if (!PNG_SIGNATURE.every((byte, i) => input.png[i] === byte)) {
      throw new DomainError('EXPORT_INVALID_IMAGE', 'Not a PNG image');
    }

    const path = await this.files.askSavePath(sanitizeFileName(input.suggestedFileName));
    if (!path) return { saved: false };
    try {
      await this.files.write(path, input.png);
    } catch {
      throw new DomainError('EXPORT_WRITE_FAILED', 'Could not write the file');
    }
    return { saved: true, filePath: path };
  }
}

/** 파일 이름에 쓸 수 없는 문자를 지우고 `.png`를 붙인다. */
export function sanitizeFileName(raw: string | undefined): string {
  const base = (raw ?? '')
    .replace(/\.png$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return base ? `${base}.png` : DEFAULT_NAME;
}
