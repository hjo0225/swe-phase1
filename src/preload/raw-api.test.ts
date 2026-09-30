import { describe, expect, it, vi } from 'vitest';
import { createRawBlinkApi } from './raw-api';

describe('createRawBlinkApi', () => {
  it('invokes whitelisted channels with a single request object and returns the envelope untouched', async () => {
    const envelope = { ok: false, error: { code: 'INTERNAL_ERROR', message: 'x' } };
    const invoke = vi.fn().mockResolvedValue(envelope);
    const api = createRawBlinkApi(invoke);

    await expect(api.app.getInfo()).resolves.toBe(envelope);
    expect(invoke).toHaveBeenCalledWith('app:get-info', {});
  });
});
