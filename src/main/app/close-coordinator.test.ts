import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloseCoordinator, type ClosableWindow } from './close-coordinator';

function fakeWindow() {
  let closeListener: ((event: { preventDefault(): void }) => void) | undefined;
  const sent: string[] = [];
  let closed = 0;
  const window: ClosableWindow = {
    on: (_event, listener) => {
      closeListener = listener;
    },
    close: () => {
      // BrowserWindow.close()는 다시 close 이벤트를 발생시킨다.
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      closeListener?.(event);
      if (!event.prevented) closed += 1;
    },
    webContents: { send: (channel) => sent.push(channel) },
  };
  return { window, sent, closedCount: () => closed };
}

describe('createCloseCoordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the first close, asks the renderer to flush, and closes once released', () => {
    const { window, sent, closedCount } = fakeWindow();
    const coordinator = createCloseCoordinator(window, { timeoutMs: 3000 });

    window.close();
    expect(closedCount()).toBe(0);
    expect(sent).toEqual(['app:will-close']);

    coordinator.release();
    expect(closedCount()).toBe(1);
  });

  it('closes anyway after the timeout when the renderer never answers', () => {
    const { window, closedCount } = fakeWindow();
    createCloseCoordinator(window, { timeoutMs: 3000 });

    window.close();
    vi.advanceTimersByTime(2999);
    expect(closedCount()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(closedCount()).toBe(1);
  });

  it('does not ask twice while waiting', () => {
    const { window, sent } = fakeWindow();
    createCloseCoordinator(window, { timeoutMs: 3000 });
    window.close();
    window.close();
    expect(sent).toEqual(['app:will-close']);
  });

  it('ignores a release that arrives without a pending close', () => {
    const { window, closedCount } = fakeWindow();
    const coordinator = createCloseCoordinator(window, { timeoutMs: 3000 });
    coordinator.release();
    expect(closedCount()).toBe(0);
  });
});
