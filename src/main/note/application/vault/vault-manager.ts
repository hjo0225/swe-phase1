import type { VaultChangedEvent, VaultInfo } from '../../../../shared/ipc/notes';
import type { Clock } from '../../../platform/clock';
import { DomainError } from '../../../platform/errors';
import type { AppConfigStore } from '../../infrastructure/vault/app-config-store';
import type { FolderService } from './folder-service';
import type { IndexSync } from './index-sync';
import type { VaultNoteService } from './vault-note-service';

const MAX_RECENT = 10;

/** 열린 보관함 하나의 자원. 닫으면 감시·색인 DB를 놓는다. */
export interface VaultSession {
  readonly root: string;
  readonly sync: Pick<IndexSync, 'full' | 'paths'>;
  watch(onChange: (paths: string[]) => void): () => void;
  close(): void;
}

/** note 도메인이 쓰는 보관함 세션. */
export interface NoteVaultSession extends VaultSession {
  readonly notes: VaultNoteService;
  readonly folders: FolderService;
  /** 노트 속 이미지 → 보관함 안의 실제 파일 (blink-vault: 프로토콜이 쓴다) */
  readonly images: { resolve(noteId: string, src: string): { path: string; type: string } | null };
}

interface VaultManagerDeps<S extends VaultSession> {
  config: AppConfigStore;
  clock: Clock;
  isDirectory(root: string): boolean;
  openSession(root: string): S;
  /** 감시로 들어온 변경이 색인을 바꿨을 때 */
  onChanged(event: VaultChangedEvent): void;
}

export const vaultInfo = (root: string): VaultInfo => ({
  root,
  name: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root,
});

/** UC-VAULT-001~003: 보관함 열기·바꾸기·최근 목록, 열린 보관함의 감시. */
export class VaultManager<S extends VaultSession = VaultSession> {
  private active: { session: S; stopWatching: () => void } | null = null;

  constructor(private readonly deps: VaultManagerDeps<S>) {}

  current(): VaultInfo | null {
    return this.active ? vaultInfo(this.active.session.root) : null;
  }

  session(): S {
    if (!this.active) throw new DomainError('VAULT_NOT_OPEN', 'No vault is open');
    return this.active.session;
  }

  open(root: string): VaultInfo {
    if (!this.deps.isDirectory(root)) throw new DomainError('VAULT_NOT_FOUND', `${root} is not a folder`);
    let session: S;
    try {
      session = this.deps.openSession(root);
      session.sync.full();
    } catch (error) {
      throw new DomainError('VAULT_NOT_ACCESSIBLE', `Could not open ${root}: ${(error as Error).message}`);
    }
    this.close();
    const stopWatching = session.watch((paths) => {
      if (this.active?.session !== session) return;
      const event = session.sync.paths(paths);
      if (event.noteIds.length > 0 || event.structure) this.deps.onChanged(event);
    });
    this.active = { session, stopWatching };
    this.remember(root);
    return vaultInfo(root);
  }

  /** 앱 시작 시 마지막 보관함을 다시 연다. 열 수 없으면 선택 화면으로 간다. */
  restoreLast(): VaultInfo | null {
    const { lastVault } = this.deps.config.load();
    if (!lastVault) return null;
    try {
      return this.open(lastVault);
    } catch {
      this.deps.config.save({ ...this.deps.config.load(), lastVault: null });
      return null;
    }
  }

  listRecent(): { items: (VaultInfo & { exists: boolean })[] } {
    return {
      items: this.deps.config.load().recentVaults.map((v) => ({ ...vaultInfo(v.root), exists: this.deps.isDirectory(v.root) })),
    };
  }

  close(): void {
    if (!this.active) return;
    this.active.stopWatching();
    this.active.session.close();
    this.active = null;
  }

  private remember(root: string): void {
    const config = this.deps.config.load();
    const same = (other: string) => other.toLowerCase() === root.toLowerCase();
    const recentVaults = [
      { root, openedAt: this.deps.clock.now().toISOString() },
      ...config.recentVaults.filter((v) => !same(v.root)),
    ].slice(0, MAX_RECENT);
    this.deps.config.save({ lastVault: root, recentVaults });
  }
}
