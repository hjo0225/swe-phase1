import { PRINT_BUSY_ATTRIBUTE } from '../../../shared/print/print-page';

export interface PrintReadinessOptions {
  /** 이 시간이 지나면 기다리기를 멈추고 지금 모습대로 인쇄하게 한다 */
  timeoutMs?: number;
  pollMs?: number;
  /** 기본은 document.fonts (없으면 기다리지 않는다) */
  fonts?: { ready: Promise<unknown> };
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 깨진 그림(404·잘못된 형식)도 "끝남"으로 본다 — 그림 하나 때문에 내보내기가 멈추지 않게 */
function settled(img: HTMLImageElement): Promise<void> {
  if (typeof img.decode === 'function') return img.decode().catch(() => undefined);
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/**
 * 인쇄해도 되는 순간까지 기다린다 (src/shared/print/print-page.ts의 약속).
 * busy 표시가 사라지고 → 그림이 모두 decode되고 → 글꼴이 준비된 뒤, 그사이 새 busy·그림이 생기지 않았으면 끝.
 */
export async function waitForPrintReady(root: HTMLElement, options: PrintReadinessOptions = {}): Promise<{ timedOut: boolean }> {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const fonts = options.fonts ?? (typeof document !== 'undefined' ? document.fonts : undefined);
  const decoded = new WeakSet<HTMLImageElement>();
  const busy = () => root.querySelector(`[${PRINT_BUSY_ATTRIBUTE}]`) !== null;
  const pendingImages = () => [...root.querySelectorAll('img')].filter((img) => !decoded.has(img));
  /** 남은 시간 안에 끝나면 true */
  const within = async (work: Promise<unknown>) => {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), left)));
    const result = await Promise.race([work.then(() => true), timeout]);
    clearTimeout(timer);
    return result;
  };

  for (;;) {
    if (Date.now() >= deadline) return { timedOut: true };
    if (busy()) {
      await sleep(pollMs);
      continue;
    }
    const images = pendingImages();
    if (images.length > 0) {
      if (!(await within(Promise.all(images.map(settled))))) return { timedOut: true };
      images.forEach((img) => decoded.add(img));
      continue;
    }
    if (fonts && !(await within(fonts.ready))) return { timedOut: true };
    // 글꼴이 바뀌면 다시 배치된다 — 한 박자 쉬고 그사이 새로 생긴 일이 없으면 끝
    await sleep(0);
    if (!busy() && pendingImages().length === 0) return { timedOut: false };
  }
}
