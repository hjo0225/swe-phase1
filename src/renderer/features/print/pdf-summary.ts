import type { PdfExportOptions } from '../../../shared/print/pdf-options';

/** 내보내기 창 아래 요약 줄: "1 page · A4 portrait · 82%" */
export function summarizePdf(options: Pick<PdfExportOptions, 'pageSize' | 'orientation'>, fit: { pages: number; scale: number }): string {
  const pages = `${fit.pages} ${fit.pages === 1 ? 'page' : 'pages'}`;
  return `${pages} · ${options.pageSize} ${options.orientation} · ${Math.round(fit.scale * 100)}%`;
}
