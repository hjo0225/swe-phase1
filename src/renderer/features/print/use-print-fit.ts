import { useEffect, useRef, useState } from 'react';
import { fitToPageWidth } from '../../../shared/print/page-fit';
import { pageCount, type PageGeometry } from '../../../shared/print/pdf-options';
import { PRINT_BUSY_ATTRIBUTE } from '../../../shared/print/print-page';

export interface PrintFit {
  /** 미리보기 내용을 줄이는 배율 = PDF 배율 */
  scale: number;
  clipped: boolean;
  /** 내용을 이 폭으로 배치했다 (layoutWidthPx × scale = 인쇄 폭) */
  layoutWidthPx: number;
  pages: number;
  /** 배율 1에서 인쇄 폭으로 그렸을 때의 높이 */
  contentHeightPx: number;
}

/** 폭을 바꾼 뒤 다시 배치하는 요소(data-print-busy)를 기다리는 최대 시간 — Main과 같다 */
const RELAYOUT_TIMEOUT_MS = 5_000;

class Superseded extends Error {}

/**
 * 미리보기의 인쇄 문서를 Main과 같은 방법(fitToPageWidth)으로 재어 배율·장 수를 정한다.
 * offsetHeight는 변형(transform) 전 높이다 — 미리보기를 작게 보여 줘도 측정은 실제 종이 크기로 한다.
 * 설정이 바뀌면 다시 잰다. 측정은 한 번에 하나씩(요소 폭을 직접 바꾸므로), 낡은 측정은 중간에 멈춘다.
 * root가 없거나(준비 전) 재는 중이면 null.
 */
export function usePrintFit(root: HTMLElement | null, page: PageGeometry, fitToOnePage: boolean, contentKey: unknown): PrintFit | null {
  const [fit, setFit] = useState<PrintFit | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { printableWidthPx, printableHeightPx } = page;

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    setFit(null);

    const measure = async (width: number) => {
      if (cancelled) throw new Superseded();
      root.style.width = `${width}px`;
      const deadline = Date.now() + RELAYOUT_TIMEOUT_MS;
      do await new Promise((resolve) => setTimeout(resolve, 0));
      while (root.querySelector(`[${PRINT_BUSY_ATTRIBUTE}]`) && Date.now() < deadline);
      if (cancelled) throw new Superseded();
      return Math.ceil(root.offsetHeight);
    };

    const run = async () => {
      const contentHeightPx = await measure(printableWidthPx);
      const result = fitToOnePage
        ? { ...(await fitToPageWidth(measure, { printableWidthPx, printableHeightPx })), pages: 1 }
        : { scale: 1, clipped: false, layoutWidthPx: printableWidthPx, pages: pageCount(contentHeightPx, printableHeightPx) };
      await measure(result.layoutWidthPx); // 고른 폭으로 배치해 둔다
      setFit({ ...result, contentHeightPx });
    };

    // 실패해도 줄은 이어 간다 — 다음 설정 변경에서 다시 잰다
    queue.current = queue.current.then(run).catch((error: unknown) => {
      if (!(error instanceof Superseded)) console.error('Could not measure the print preview', error);
    });
    return () => {
      cancelled = true;
    };
  }, [root, printableWidthPx, printableHeightPx, fitToOnePage, contentKey]);

  return fit;
}
