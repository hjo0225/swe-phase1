import { describe, expect, it, vi } from 'vitest';
import type { VaultChangedEvent } from '../../../../shared/ipc/notes';
import type { AppConfig, AppConfigStore } from '../../infrastructure/vault/app-config-store';
import { VaultManager, type VaultSession } from './vault-manager';

class MemoryConfig implements AppConfigStore {
  constructor(public config: AppConfig = { lastVault: null, recentVaults: [] }) {}
  load = () => structuredClone(this.config);
  save = (config: AppConfig) => void (this.config = structuredClone(config));
}

function fakeSession(root: string, changes: VaultChangedEvent = { noteIds: ['n1'], structure: false }) {
  let listener: ((paths: string[]) => void) | undefined;
  const session = {
    root,
    sync: { full: vi.fn(() => ({ noteIds: [], structure: false })), paths: vi.fn(() => changes) },
    watch: vi.fn((onChange: (paths: string[]) => void) => {
      listener = onChange;
      return vi.fn();
    }),
    close: vi.fn(),
    emit: (paths: string[]) => listener?.(paths),
  };
  return session;
}

function setup(options: { dirs?: string[]; config?: AppConfig; failOpen?: string } = {}) {
  const dirs = new Set(options.dirs ?? ['C:/vault-a', 'C:/vault-b']);
  const config = new MemoryConfig(options.config);
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const onChanged = vi.fn();
  let tick = 0;
  const manager = new VaultManager({
    config,
    clock: { now: () => new Date(Date.UTC(2026, 8, 30, 0, tick++)) },
    isDirectory: (root) => dirs.has(root),
    openSession: (root) => {
      if (root === options.failOpen) throw new Error('EACCES');
      const session = fakeSession(root);
      sessions.push(session);
      return session as unknown as VaultSession;
    },
    onChanged,
  });
  return { manager, config, sessions, onChanged, dirs };
}

describe('VaultManager', () => {
  it('has no vault until one is opened', () => {
    const { manager } = setup();
    expect(manager.current()).toBeNull();
    expect(() => manager.session()).toThrow(expect.objectContaining({ code: 'VAULT_NOT_OPEN' }));
  });

  it('opens a vault: syncs the index, watches it and remembers it', () => {
    const { manager, config, sessions } = setup();
    expect(manager.open('C:/vault-a')).toEqual({ root: 'C:/vault-a', name: 'vault-a' });
    expect(sessions[0]!.sync.full).toHaveBeenCalledOnce();
    expect(sessions[0]!.watch).toHaveBeenCalledOnce();
    expect(config.config.lastVault).toBe('C:/vault-a');
    expect(config.config.recentVaults.map((v) => v.root)).toEqual(['C:/vault-a']);
  });

  it('switching closes the previous session and moves the vault to the front of the recent list', () => {
    const { manager, config, sessions } = setup();
    manager.open('C:/vault-a');
    manager.open('C:/vault-b');
    manager.open('C:/vault-a');
    expect(sessions[0]!.close).toHaveBeenCalledOnce();
    expect(sessions[1]!.close).toHaveBeenCalledOnce();
    expect(config.config.recentVaults.map((v) => v.root)).toEqual(['C:/vault-a', 'C:/vault-b']);
    expect(manager.current()?.root).toBe('C:/vault-a');
  });

  it('rejects a missing folder and keeps the current vault', () => {
    const { manager } = setup();
    manager.open('C:/vault-a');
    expect(() => manager.open('C:/nope')).toThrow(expect.objectContaining({ code: 'VAULT_NOT_FOUND' }));
    expect(manager.current()?.root).toBe('C:/vault-a');
  });

  it('reports an unreadable folder as VAULT_NOT_ACCESSIBLE', () => {
    const { manager } = setup({ failOpen: 'C:/vault-b' });
    expect(() => manager.open('C:/vault-b')).toThrow(expect.objectContaining({ code: 'VAULT_NOT_ACCESSIBLE' }));
    expect(manager.current()).toBeNull();
  });

  it('forwards watcher changes that touched the index', () => {
    const { manager, sessions, onChanged } = setup();
    manager.open('C:/vault-a');
    sessions[0]!.emit(['a.md']);
    expect(sessions[0]!.sync.paths).toHaveBeenCalledWith(['a.md']);
    expect(onChanged).toHaveBeenCalledWith({ noteIds: ['n1'], structure: false });
  });

  it('restores the last vault on start, and forgets it when the folder is gone', () => {
    const remembered = { lastVault: 'C:/vault-b', recentVaults: [{ root: 'C:/vault-b', openedAt: '2026-09-01T00:00:00.000Z' }] };
    expect(setup({ config: structuredClone(remembered) }).manager.restoreLast()?.root).toBe('C:/vault-b');

    const gone = setup({ dirs: [], config: structuredClone(remembered) });
    expect(gone.manager.restoreLast()).toBeNull();
    expect(gone.config.config.lastVault).toBeNull();
  });

  it('lists recent vaults with whether they still exist', () => {
    const { manager, dirs } = setup();
    manager.open('C:/vault-a');
    manager.open('C:/vault-b');
    dirs.delete('C:/vault-a');
    expect(manager.listRecent().items).toEqual([
      { root: 'C:/vault-b', name: 'vault-b', exists: true },
      { root: 'C:/vault-a', name: 'vault-a', exists: false },
    ]);
  });
});
