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

    await api.notes.tree();
    await api.notes.create({ folder: 'a' });
    await api.notes.get({ id });
    await api.notes.update({ id, content: '# u' });
    await api.notes.rename({ id, title: 'v' });
    await api.notes.move({ id, folder: 'b' });
    await api.notes.delete({ id });
    await api.notes.exportPdf({ id });
    await api.folders.create({ name: 'c' });
    await api.folders.rename({ path: 'c', name: 'd' });
    await api.folders.delete({ path: 'd' });
    await api.vault.open({ root: 'C:/v' });
    await api.app.readyToClose();

    expect(invoke.mock.calls).toEqual([
      ['note:tree', {}],
      ['note:create', { folder: 'a' }],
      ['note:get', { id }],
      ['note:update', { id, content: '# u' }],
      ['note:rename', { id, title: 'v' }],
      ['note:move', { id, folder: 'b' }],
      ['note:delete', { id }],
      ['note:export-pdf', { id }],
      ['folder:create', { name: 'c' }],
      ['folder:rename', { path: 'c', name: 'd' }],
      ['folder:delete', { path: 'd' }],
      ['vault:open', { root: 'C:/v' }],
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

  it('maps organize methods to organize channels and passes file paths through', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: null });
    const api = createRawBlinkApi(invoke, noSubscribe, (file) => `C:/Downloads/${file.name}`);
    const id = '11111111-1111-4111-8111-111111111111';
    const plan = { folder: '', newFolders: [], moves: [], skipped: null };

    await api.organize.preview({ folder: '' });
    await api.organize.apply(plan);
    await api.organize.place({ id });
    await api.organize.importFile({ sourcePath: 'C:/a.md', folder: '' });

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'organize:preview',
      'organize:apply',
      'organize:place',
      'organize:import',
    ]);
    expect(api.organize.pathForFile(new File([''], '강의.md'))).toBe('C:/Downloads/강의.md');
  });
});
