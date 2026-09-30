import { describe, expect, it, vi } from 'vitest';
import { createRawBlinkApi } from './raw-api';

const noSubscribe = () => () => undefined;

describe('createRawBlinkApi', () => {
  it('invokes whitelisted channels with a single request object and returns the envelope untouched', async () => {
    const envelope = { ok: false, error: { code: 'INTERNAL_ERROR', message: 'x' } };
    const invoke = vi.fn().mockResolvedValue(envelope);
    const api = createRawBlinkApi(invoke, noSubscribe);

    await expect(api.app.getInfo()).resolves.toBe(envelope);
    expect(invoke).toHaveBeenCalledWith('app:get-info', {});
  });

  it('maps note methods to note channels', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: null });
    const api = createRawBlinkApi(invoke, noSubscribe);
    const id = '11111111-1111-4111-8111-111111111111';

    await api.notes.create({ title: 't' });
    await api.notes.list();
    await api.notes.get({ id });
    await api.notes.update({ id, title: 'u' });
    await api.notes.delete({ id });
    await api.app.readyToClose();

    expect(invoke.mock.calls).toEqual([
      ['note:create', { title: 't' }],
      ['note:list', {}],
      ['note:get', { id }],
      ['note:update', { id, title: 'u' }],
      ['note:delete', { id }],
      ['app:ready-to-close', {}],
    ]);
  });

  it('subscribes to push events and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn().mockReturnValue(unsubscribe);
    const api = createRawBlinkApi(vi.fn(), subscribe);
    const listener = vi.fn();

    expect(api.app.onWillClose(listener)).toBe(unsubscribe);
    expect(subscribe).toHaveBeenCalledWith('app:will-close', expect.any(Function));
    subscribe.mock.calls[0]![1]({});
    expect(listener).toHaveBeenCalledOnce();
  });
});
