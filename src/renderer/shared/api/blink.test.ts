// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { RawBlinkApi } from '../../../shared/ipc/blink-api';
import { BlinkIpcError } from '../../../shared/ipc/errors';
import { getBlink, resetBlinkForTests, wrapRawApi } from './blink';

const rawReturning = (result: unknown): RawBlinkApi => ({ app: { getInfo: async () => result } }) as RawBlinkApi;

describe('wrapRawApi', () => {
  it('unwraps ok envelopes to data', async () => {
    const api = wrapRawApi(rawReturning({ ok: true, data: { version: '1.2.3' } }));
    await expect(api.app.getInfo()).resolves.toEqual({ version: '1.2.3' });
  });

  it('throws BlinkIpcError carrying the error code for failed envelopes', async () => {
    const api = wrapRawApi(
      rawReturning({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'bad', details: [1] } }),
    );
    const error = await api.app.getInfo().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BlinkIpcError);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'bad', details: [1] });
  });
});

describe('getBlink', () => {
  afterEach(() => {
    delete window.blink;
    resetBlinkForTests();
  });

  it('uses window.blink when the preload exposed it', async () => {
    window.blink = rawReturning({ ok: true, data: { version: 'preload' } });
    await expect(getBlink().app.getInfo()).resolves.toEqual({ version: 'preload' });
  });

  it('falls back to the in-memory mock outside Electron', async () => {
    await expect(getBlink().app.getInfo()).resolves.toEqual({ version: 'mock' });
  });
});
