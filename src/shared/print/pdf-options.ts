/**
 * PDF 내보내기 설정. 모달(Renderer) → IPC → Main(printToPDF) → 인쇄 화면(쿼리)으로 같은 값이 전해진다.
 * 종이 크기 계산은 여기 한 곳에서 한다 — 미리보기와 Main이 같은 배율을 얻도록.
 * CSS px는 인치당 96이다 (Chromium 인쇄 기준).
 */
export const PAGE_SIZES = ['A4', 'A3', 'Letter'] as const;
export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export const MARGINS = ['default', 'small', 'none'] as const;
export const COLUMNS = [1, 2] as const;

export type PageSize = (typeof PAGE_SIZES)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type MarginPreset = (typeof MARGINS)[number];
export type ColumnCount = (typeof COLUMNS)[number];

export interface PdfExportOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginPreset;
  /** 노트 제목을 맨 위에 찍는다. 없으면 자동: 본문이 `# 제목`으로 시작하지 않을 때만 */
  includeTitle?: boolean;
  /** 한 장에 맞춰 줄인다. 끄면 배율 1로 여러 장 */
  fitToOnePage: boolean;
  /** 논문처럼 두 단으로. 한 장에 맞출 때만 — 여러 장이면 단이 장을 넘나들어 읽는 순서가 꼬인다 */
  columns: ColumnCount;
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  pageSize: 'A4',
  orientation: 'portrait',
  margin: 'default',
  fitToOnePage: true,
  columns: 1,
};

/** 두 단 사이 간격 (CSS px) */
export const COLUMN_GAP_PX = 28;

/** 실제로 쓸 단 수: 한 장 맞춤이 아니면 늘 1 */
export const effectiveColumns = (options: Pick<PdfExportOptions, 'fitToOnePage' | 'columns'>): ColumnCount =>
  options.fitToOnePage ? options.columns : 1;

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const mmToPx = (mm: number) => (mm / MM_PER_INCH) * CSS_PX_PER_INCH;

/** 세로 방향 [폭, 높이] mm */
const PAGE_MM: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
};

const MARGIN_MM: Record<MarginPreset, number> = { default: 12, small: 6, none: 0 };

export interface PageGeometry {
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  marginInches: number;
  /** 여백을 뺀 인쇄 영역. 인쇄 화면은 이 폭으로 그려 배율 1에서 화면과 PDF의 줄바꿈이 같다 */
  printableWidthPx: number;
  printableHeightPx: number;
}

export function pageGeometry(options: Pick<PdfExportOptions, 'pageSize' | 'orientation' | 'margin'>): PageGeometry {
  const [shortMm, longMm] = PAGE_MM[options.pageSize];
  const [widthMm, heightMm] = options.orientation === 'landscape' ? [longMm, shortMm] : [shortMm, longMm];
  const marginMm = MARGIN_MM[options.margin];
  return {
    pageWidthPx: mmToPx(widthMm),
    pageHeightPx: mmToPx(heightMm),
    marginPx: mmToPx(marginMm),
    marginInches: marginMm / MM_PER_INCH,
    printableWidthPx: mmToPx(widthMm - 2 * marginMm),
    printableHeightPx: mmToPx(heightMm - 2 * marginMm),
  };
}

/** 인쇄 화면 주소의 쿼리 (`size=A4&orientation=portrait&margin=default&fit=1&cols=1[&title=0|1]`) */
export function toPrintQuery(options: PdfExportOptions): string {
  const query = new URLSearchParams({
    size: options.pageSize,
    orientation: options.orientation,
    margin: options.margin,
    fit: options.fitToOnePage ? '1' : '0',
    cols: String(options.columns),
  });
  if (options.includeTitle !== undefined) query.set('title', options.includeTitle ? '1' : '0');
  return query.toString();
}

const pick = <T extends string>(allowed: readonly T[], value: string | null, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** 모르는 값은 기본값으로 — 인쇄 화면은 주소가 조금 틀려도 기본 모양으로 그린다 */
export function parsePrintQuery(query: URLSearchParams): PdfExportOptions {
  const options: PdfExportOptions = {
    pageSize: pick(PAGE_SIZES, query.get('size'), DEFAULT_PDF_OPTIONS.pageSize),
    orientation: pick(ORIENTATIONS, query.get('orientation'), DEFAULT_PDF_OPTIONS.orientation),
    margin: pick(MARGINS, query.get('margin'), DEFAULT_PDF_OPTIONS.margin),
    fitToOnePage: query.get('fit') !== '0',
    columns: 1,
  };
  options.columns = effectiveColumns({ fitToOnePage: options.fitToOnePage, columns: query.get('cols') === '2' ? 2 : 1 });
  const title = query.get('title');
  if (title === '1' || title === '0') options.includeTitle = title === '1';
  return options;
}

/** 배율 1로 인쇄할 때의 장 수 (근사: Chromium은 줄 중간에서 자르지 않으려고 조금 일찍 넘길 수 있다) */
export function pageCount(contentHeightPx: number, printableHeightPx: number): number {
  return Math.max(1, Math.ceil(contentHeightPx / printableHeightPx));
}
