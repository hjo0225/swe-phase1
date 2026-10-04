/**
 * 노트 → 한 장짜리 A4 세로 PDF 규칙. Main(printToPDF 옵션·배율)과 Renderer(인쇄 화면 폭)가 같은 값을 쓴다.
 * CSS px는 인치당 96이다 (Chromium 인쇄 기준).
 */
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 12;

const mmToPx = (mm: number) => (mm / MM_PER_INCH) * CSS_PX_PER_INCH;

export const A4_PRINT = {
  marginInches: MARGIN_MM / MM_PER_INCH,
  /** 여백을 뺀 인쇄 영역. 인쇄 화면은 이 폭으로 그려 배율 1에서 화면과 PDF의 줄바꿈이 같다 */
  printableWidthPx: mmToPx(A4_WIDTH_MM - 2 * MARGIN_MM),
  printableHeightPx: mmToPx(A4_HEIGHT_MM - 2 * MARGIN_MM),
} as const;

/** Chromium printToPDF가 받는 배율 범위의 아래 끝 (0.1~2) */
export const MIN_PDF_SCALE = 0.1;

/** 측정값과 인쇄 배치의 작은 차이(반올림·글꼴 힌팅)로 둘째 장이 생기지 않게 남겨 두는 여유 */
const HEADROOM = 0.98;

export interface PageFit {
  /** printToPDF scale. 1 = 화면 그대로 */
  scale: number;
  /** 가장 작은 배율로도 한 장에 다 들어가지 않아 아래쪽이 잘린다 */
  clipped: boolean;
}

/**
 * 내용 높이(인쇄 폭으로 그렸을 때의 CSS px)를 한 장에 맞추는 배율.
 * 들어가면 1, 넘치면 고르게 줄이고, 최소 배율로도 넘치면 최소 배율로 첫 장만 남긴다(잘림).
 */
export function fitToOnePage(contentHeightPx: number, printableHeightPx: number = A4_PRINT.printableHeightPx): PageFit {
  const usable = printableHeightPx * HEADROOM;
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= usable) return { scale: 1, clipped: false };
  const scale = Math.floor((usable / contentHeightPx) * 1000) / 1000;
  if (scale < MIN_PDF_SCALE) return { scale: MIN_PDF_SCALE, clipped: contentHeightPx * MIN_PDF_SCALE > printableHeightPx };
  return { scale, clipped: false };
}
