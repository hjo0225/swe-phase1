/**
 * 노트 → 한 장짜리 PDF 규칙. Main(printToPDF 옵션·배율)과 Renderer(인쇄 화면 폭)가 같은 값을 쓴다.
 */
import { DEFAULT_PDF_OPTIONS, pageGeometry } from './pdf-options';

/** 기본 종이(A4 세로, 여백 12mm) */
export const A4_PRINT = pageGeometry(DEFAULT_PDF_OPTIONS);

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

/** 배율을 이만큼 가까이 찾으면 멈춘다 */
const SCALE_TOLERANCE = 0.01;

export interface WidthFit extends PageFit {
  /** 인쇄 화면을 이 폭(CSS px)으로 다시 배치한 뒤 scale로 인쇄한다. layoutWidthPx × scale = 인쇄 영역 폭 */
  layoutWidthPx: number;
}

/**
 * 한 장에 맞추되 종이 폭을 꽉 채우는 배율. 내용이 길면 폭 W = 인쇄 폭 / s로 넓게 다시 배치하고(줄이 길어져 높이가 준다)
 * s로 줄여 인쇄하면 인쇄 폭을 꽉 채운다. 조건: measure(인쇄 폭 / s) × s ≤ 쓸 수 있는 높이.
 *
 * 인쇄 높이 f(s) = measure(인쇄 폭 / s) × s는 s가 클수록 커진다(글자가 커지면 길어진다) — 이분 탐색으로
 * 조건을 만족하는 가장 큰 s를 0.01 안으로 찾는다(측정 최대 약 9번). 고른 s는 늘 실제로 재어 확인한 값이다.
 * 넓혀도 들어가지 않으면(폭을 따라 커지는 내용, 아주 긴 노트) 예전처럼 인쇄 폭에서 고르게 줄인다(fitToOnePage).
 * 고르게 줄이는 쪽이 더 큰 배율(= 더 큰 글자)이면 그쪽을 쓴다.
 */
export async function fitToPageWidth(
  measure: (layoutWidthPx: number) => Promise<number>,
  page: { printableWidthPx: number; printableHeightPx: number } = A4_PRINT,
): Promise<WidthFit> {
  const usable = page.printableHeightPx * HEADROOM;
  const fits = async (scale: number) => (await measure(page.printableWidthPx / scale)) * scale <= usable;

  const heightAtPageWidth = await measure(page.printableWidthPx);
  const uniform: WidthFit = { ...fitToOnePage(heightAtPageWidth, page.printableHeightPx), layoutWidthPx: page.printableWidthPx };
  if (uniform.scale === 1 || !(await fits(MIN_PDF_SCALE))) return uniform;

  let low = MIN_PDF_SCALE; // 들어감 (확인함)
  let high = 1; // 넘침 (확인함)
  while (high - low >= SCALE_TOLERANCE) {
    const mid = (low + high) / 2;
    if (await fits(mid)) low = mid;
    else high = mid;
  }
  // 조금 더 작은 배율은 더 짧다 — 내려서 반올림해도 들어간다
  const scale = Math.floor(low * 1000) / 1000;
  if (uniform.scale >= scale) return uniform;
  return { scale, clipped: false, layoutWidthPx: page.printableWidthPx / scale };
}
