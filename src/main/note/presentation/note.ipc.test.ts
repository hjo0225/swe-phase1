import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NoteDetail } from '../../../shared/ipc/notes';
import { VaultManager, type NoteVaultSession } from '../application/vault/vault-manager';
import { JsonAppConfigStore } from '../infrastructure/vault/app-config-store';
import { openNoteVault } from '../infrastructure/vault/open-note-vault';
import { noteIpcHandlers } from './note.ipc';

describe('noteIpcHandlers', () => {
  let dir: string;
  let vault: string;
  let vaults: VaultManager<NoteVaultSession>;
  let handlers: ReturnType<typeof noteIpcHandlers>;
  let chosen: string | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blink-note-ipc-'));
    vault = mkdtempSync(join(dir, 'vault-'));
    const clock = { now: () => new Date(0) };
    vaults = new VaultManager({
      config: new JsonAppConfigStore(join(dir, 'app-config.json')),
      clock,
      isDirectory: (root) => statSync(root, { throwIfNoEntry: false })?.isDirectory() ?? false,
      openSession: (root) =>
        openNoteVault(root, { indexDir: join(dir, 'vaults'), clock, nextId: () => crypto.randomUUID() }),
      onChanged: () => {},
    });
    chosen = vault;
    handlers = noteIpcHandlers({ vaults, chooseFolder: async () => chosen });
  });
  afterEach(() => {
    vaults.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const call = (channel: string, request: unknown = {}) => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler(request);
  };
  const data = async <T>(channel: string, request: unknown = {}) => {
    const result = await call(channel, request);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data as T;
  };

  it('exposes every vault, note and folder channel', () => {
    expect(Object.keys(handlers).sort()).toEqual([
      'folder:create',
      'folder:delete',
      'folder:rename',
      'note-link:list',
      'note:create',
      'note:delete',
      'note:get',
      'note:move',
      'note:rename',
      'note:search',
      'note:tree',
      'note:update',
      'vault:choose',
      'vault:get-current',
      'vault:list-recent',
      'vault:open',
    ]);
  });

  it('refuses note calls until a vault is open', async () => {
    await expect(call('note:tree')).resolves.toMatchObject({ ok: false, error: { code: 'VAULT_NOT_OPEN' } });
    await expect(call('vault:get-current')).resolves.toEqual({ ok: true, data: null });
  });

  it('opens the chosen folder and returns null when the dialog is cancelled', async () => {
    chosen = null;
    await expect(call('vault:choose')).resolves.toEqual({ ok: true, data: null });
    chosen = vault;
    await expect(data('vault:choose')).resolves.toMatchObject({ root: vault });
    await expect(data('vault:list-recent')).resolves.toEqual({
      items: [expect.objectContaining({ root: vault, exists: true })],
    });
  });

  it('creates, edits and renames a note through envelopes', async () => {
    await data('vault:open', { root: vault });
    await data('folder:create', { name: '프로젝트' });
    const created = await data<NoteDetail>('note:create', { folder: '프로젝트' });
    expect(created).toMatchObject({ title: '제목 없음', path: '프로젝트/제목 없음.md', content: '' });
    await expect(data('note:update', { id: created.id, content: '# 회의' })).resolves.toMatchObject({ changed: true });
    await expect(data('note:rename', { id: created.id, title: '회의' })).resolves.toMatchObject({
      note: { title: '회의', path: '프로젝트/회의.md' },
    });
    await expect(data('note:get', { id: created.id })).resolves.toMatchObject({ content: '# 회의' });
  });

  it('rejects malformed requests before touching the vault', async () => {
    await expect(call('note:get', { id: 'nope' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    await expect(call('note:update', { id: crypto.randomUUID() })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('note:search', { query: 'x', limit: 51 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });
});
