import { describe, expect, it } from 'vitest';
import { OrganizeLock } from './organize-lock';

describe('OrganizeLock', () => {
  it('is busy only while a task runs, and releases after success or failure', async () => {
    const lock = new OrganizeLock();
    let seen = false;
    await lock.run(async () => {
      seen = lock.busy;
    });
    expect(seen).toBe(true);
    expect(lock.busy).toBe(false);

    await expect(
      lock.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(lock.busy).toBe(false);
  });

  it('refuses a second organize task and vault changes while busy', async () => {
    const lock = new OrganizeLock();
    let release!: () => void;
    const first = lock.run(() => new Promise<void>((resolve) => (release = resolve)));

    await expect(lock.run(async () => 'second')).rejects.toMatchObject({ code: 'VAULT_BUSY' });
    expect(() => lock.assertIdle()).toThrow(expect.objectContaining({ code: 'VAULT_BUSY' }));

    release();
    await first;
    expect(() => lock.assertIdle()).not.toThrow();
  });
});
