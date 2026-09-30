import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveRegistry, SaveQueue } from './save-queue';

type Payload = { title: string };

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves the latest payload once after the debounce', async () => {
    const save = vi.fn<(p: Payload) => Promise<void>>().mockResolvedValue();
    const queue = new SaveQueue<Payload>(save, { debounceMs: 700 });

    queue.markDirty(() => ({ title: 'a' }));
    queue.markDirty(() => ({ title: 'ab' }));
    expect(queue.status).toBe('dirty');
    await vi.advanceTimersByTimeAsync(699);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledExactlyOnceWith({ title: 'ab' });
    expect(queue.status).toBe('saved');
  });

  it('serializes saves and saves again when edited during an in-flight save', async () => {
    const first = deferred();
    const save = vi.fn<(p: Payload) => Promise<void>>().mockReturnValueOnce(first.promise).mockResolvedValue();
    const queue = new SaveQueue<Payload>(save, { debounceMs: 700 });

    queue.markDirty(() => ({ title: 'v1' }));
    const flushing = queue.flush();
    expect(queue.status).toBe('saving');

    queue.markDirty(() => ({ title: 'v2' }));
    const secondFlush = queue.flush();
    expect(save).toHaveBeenCalledTimes(1); // 앞 저장이 끝나기 전에는 보내지 않는다

    first.resolve();
    await Promise.all([flushing, secondFlush]);
    expect(save.mock.calls.map(([p]) => p.title)).toEqual(['v1', 'v2']);
    expect(queue.status).toBe('saved');
  });

  it('reports errors and retries with the latest payload on the next flush', async () => {
    const save = vi.fn<(p: Payload) => Promise<void>>().mockRejectedValueOnce(new Error('disk')).mockResolvedValue();
    const queue = new SaveQueue<Payload>(save, { debounceMs: 700 });

    queue.markDirty(() => ({ title: 'x' }));
    await queue.flush();
    expect(queue.status).toBe('error');

    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.status).toBe('saved');
  });

  it('does nothing on flush when clean, and drops pending work on cancel', async () => {
    const save = vi.fn<(p: Payload) => Promise<void>>().mockResolvedValue();
    const queue = new SaveQueue<Payload>(save, { debounceMs: 700 });

    await queue.flush();
    queue.markDirty(() => ({ title: 'x' }));
    queue.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    await queue.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('notifies subscribers on status changes', async () => {
    const queue = new SaveQueue<Payload>(() => Promise.resolve(), { debounceMs: 700 });
    const seen: string[] = [];
    const unsubscribe = queue.subscribe(() => seen.push(queue.status));
    queue.markDirty(() => ({ title: 'x' }));
    await queue.flush();
    unsubscribe();
    expect(seen).toEqual(['dirty', 'saving', 'saved']);
  });
});

describe('AutosaveRegistry', () => {
  it('reuses one queue per note and flushes all of them', async () => {
    const save = vi.fn<(id: string, p: Payload) => Promise<void>>().mockResolvedValue();
    const registry = new AutosaveRegistry<Payload>(save, { debounceMs: 700 });

    expect(registry.get('a')).toBe(registry.get('a'));
    registry.get('a').markDirty(() => ({ title: 'A' }));
    registry.get('b').markDirty(() => ({ title: 'B' }));
    await registry.flushAll();

    expect(save.mock.calls).toEqual([
      ['a', { title: 'A' }],
      ['b', { title: 'B' }],
    ]);
  });

  it('forgets a note after discard, cancelling its pending save', async () => {
    const save = vi.fn<(id: string, p: Payload) => Promise<void>>().mockResolvedValue();
    const registry = new AutosaveRegistry<Payload>(save, { debounceMs: 700 });
    const queue = registry.get('a');
    queue.markDirty(() => ({ title: 'A' }));

    registry.discard('a');
    await registry.flushAll();
    expect(save).not.toHaveBeenCalled();
    expect(registry.get('a')).not.toBe(queue);
  });
});
