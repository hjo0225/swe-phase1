// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRINT_BUSY_ATTRIBUTE } from '../../../shared/print/print-page';
import { waitForPrintReady } from './print-readiness';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function image(decode: () => Promise<void>) {
  const img = document.createElement('img');
  Object.defineProperty(img, 'decode', { value: decode });
  return img;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('waitForPrintReady', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('waits until every image is decoded and web fonts are ready', async () => {
    const root = document.createElement('div');
    const first = deferred();
    root.append(image(() => first.promise), image(() => Promise.resolve()));
    const fonts = deferred();
    let done = false;
    const ready = waitForPrintReady(root, { fonts: { ready: fonts.promise }, pollMs: 5 }).then((r) => {
      done = true;
      return r;
    });

    await settle();
    expect(done).toBe(false);
    first.resolve();
    await settle();
    expect(done).toBe(false);
    fonts.resolve();
    await expect(ready).resolves.toEqual({ timedOut: false });
  });

  it('does not wait forever for a broken image', async () => {
    const root = document.createElement('div');
    root.append(image(() => Promise.reject(new Error('EncodingError'))));
    await expect(waitForPrintReady(root, { pollMs: 5 })).resolves.toEqual({ timedOut: false });
  });

  it(`waits while any element is marked ${PRINT_BUSY_ATTRIBUTE} (async layout), and for images it adds`, async () => {
    const root = document.createElement('div');
    const busy = document.createElement('figure');
    busy.setAttribute(PRINT_BUSY_ATTRIBUTE, '');
    root.append(busy);
    let done = false;
    const ready = waitForPrintReady(root, { pollMs: 5 }).then(() => (done = true));

    await settle();
    expect(done).toBe(false);
    // 배치가 끝나며 그림을 하나 더 넣고 표시를 지운다
    const late = deferred();
    const decode = vi.fn(() => late.promise);
    busy.append(image(decode));
    busy.removeAttribute(PRINT_BUSY_ATTRIBUTE);
    await settle();
    expect(decode).toHaveBeenCalled();
    expect(done).toBe(false);
    late.resolve();
    await ready;
    expect(done).toBe(true);
  });

  it('gives up after the timeout so a stuck element cannot block the export forever', async () => {
    const root = document.createElement('div');
    const busy = document.createElement('figure');
    busy.setAttribute(PRINT_BUSY_ATTRIBUTE, '');
    root.append(busy);
    await expect(waitForPrintReady(root, { pollMs: 5, timeoutMs: 50 })).resolves.toEqual({ timedOut: true });
  });
});
