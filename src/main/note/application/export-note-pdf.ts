import type { ExportPdfResult } from '../../../shared/ipc/notes';
import { DEFAULT_PDF_OPTIONS, type PdfExportOptions } from '../../../shared/print/pdf-options';
import { DomainError } from '../../platform/errors';

const PDF_SIGNATURE = '%PDF';
const DEFAULT_NAME = 'note.pdf';

/** 저장 위치는 항상 사용자가 Main의 Dialog에서 고른다 — Renderer가 임의 경로에 쓸 수 없게 한다. */
export interface PdfFileSaver {
  /** 취소하면 null */
  askSavePath(defaultFileName: string): Promise<string | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

/** 노트를 문서 모양(앱 화면 없이)으로 그려 설정대로(종이·여백·제목·한 장 맞춤) PDF로 만든다. */
export interface NotePdfRenderer {
  render(noteId: string, options: PdfExportOptions): Promise<{ pdf: Uint8Array; scale: number; clipped: boolean }>;
}

export interface ExportNotePdfDeps {
  /** 없는 노트면 NOTE_NOT_FOUND를 던진다 */
  notes: { get(id: string): { title: string } };
  files: PdfFileSaver;
  renderer: NotePdfRenderer;
}

/** 노트를 PDF로 내보낸다(기본: A4 세로 한 장). 저장할 곳을 먼저 묻고(취소하면 아무것도 그리지 않는다) 그 경로에만 쓴다. */
export class ExportNotePdf {
  constructor(private readonly deps: ExportNotePdfDeps) {}

  async execute(input: { id: string; options?: PdfExportOptions }): Promise<ExportPdfResult> {
    const { title } = this.deps.notes.get(input.id);
    const path = await this.deps.files.askSavePath(pdfFileName(title));
    if (!path) return { saved: false };

    let rendered: Awaited<ReturnType<NotePdfRenderer['render']>>;
    try {
      rendered = await this.deps.renderer.render(input.id, input.options ?? DEFAULT_PDF_OPTIONS);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('EXPORT_RENDER_FAILED', 'Could not render the note as PDF');
    }
    if (new TextDecoder().decode(rendered.pdf.subarray(0, PDF_SIGNATURE.length)) !== PDF_SIGNATURE) {
      throw new DomainError('EXPORT_RENDER_FAILED', 'Renderer did not produce a PDF');
    }

    try {
      await this.deps.files.write(path, rendered.pdf);
    } catch {
      throw new DomainError('EXPORT_WRITE_FAILED', 'Could not write the file');
    }
    return { saved: true, filePath: path, scale: rendered.scale, clipped: rendered.clipped };
  }
}

/** 노트 제목에서 파일 이름에 쓸 수 없는 문자를 지우고 `.pdf`를 붙인다. */
export function pdfFileName(title: string): string {
  const base = title
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return base ? `${base}.pdf` : DEFAULT_NAME;
}
