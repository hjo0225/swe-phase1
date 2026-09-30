import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError } from '../errors';
import { createIpcHandler } from './handler';

const schema = z.object({ name: z.string().min(1) });

describe('createIpcHandler', () => {
  it('returns ok envelope with the use case result', async () => {
    const handler = createIpcHandler(schema, ({ name }) => `hi ${name}`);
    await expect(handler({ name: 'blink' })).resolves.toEqual({ ok: true, data: 'hi blink' });
  });

  it('awaits async use cases', async () => {
    const handler = createIpcHandler(schema, async ({ name }) => name.length);
    await expect(handler({ name: 'abc' })).resolves.toEqual({ ok: true, data: 3 });
  });

  it('maps schema failures to VALIDATION_FAILED with field paths, without running the use case', async () => {
    const run = vi.fn();
    const result = await createIpcHandler(schema, run)({ name: '' });
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    if (!result.ok) expect(result.error.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('maps DomainError to its code, message and details', async () => {
    const handler = createIpcHandler(schema, () => {
      throw new DomainError('VALIDATION_FAILED', 'domain says no', { max: 3 });
    });
    await expect(handler({ name: 'x' })).resolves.toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'domain says no', details: { max: 3 } },
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs them', async () => {
    const logger = { error: vi.fn() };
    const boom = new Error('SQLITE_CONSTRAINT: secret detail');
    const result = await createIpcHandler(
      schema,
      () => {
        throw boom;
      },
      logger,
    )({ name: 'x' });
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
    expect(logger.error).toHaveBeenCalledWith(boom);
  });
});
