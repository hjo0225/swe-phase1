import type { VaultChangedEvent } from '../../../../shared/ipc/notes';
import { readEntry, type VaultDeps } from './vault-deps';

/**
 * 파일(원본)과 색인을 맞춘다 (UC-VAULT-002).
 * 크기·수정 시각이 같으면 다시 읽지 않는다 — Blink가 방금 쓴 파일은 색인이 먼저 갱신되어 있어 자연히 건너뛴다.
 */
export class IndexSync {
  constructor(private readonly deps: VaultDeps) {}

  full(): VaultChangedEvent {
    const { fs, index, nextId } = this.deps;
    const rows = new Map(index.all().map((row) => [row.path.toLowerCase(), row]));
    const changed: string[] = [];
    let structure = false;

    for (const file of fs.listMarkdownFiles()) {
      const key = file.path.toLowerCase();
      const row = rows.get(key);
      rows.delete(key);
      if (row && row.size === file.size && row.mtimeMs === file.mtimeMs && row.path === file.path) continue;
      const entry = readEntry(fs, file.path, row?.id ?? nextId(), row);
      if (!entry) continue;
      index.upsert(entry);
      changed.push(entry.id);
      if (!row) structure = true;
    }
    for (const gone of rows.values()) {
      index.remove(gone.id);
      changed.push(gone.id);
      structure = true;
    }
    return { noteIds: changed, structure };
  }

  /** 감시 이벤트로 받은 경로만 맞춘다. 폴더가 바뀐 것 같으면 전체를 훑는다. */
  paths(paths: readonly string[]): VaultChangedEvent {
    if (paths.some((p) => !/\.md$/i.test(p))) return this.full();
    const { fs, index, nextId } = this.deps;
    const changed: string[] = [];
    let structure = false;
    for (const path of new Set(paths)) {
      const row = index.findByPath(path);
      const stat = fs.stat(path);
      if (!stat) {
        if (row) {
          index.remove(row.id);
          changed.push(row.id);
          structure = true;
        }
        continue;
      }
      if (row && row.size === stat.size && row.mtimeMs === stat.mtimeMs) continue;
      const entry = readEntry(fs, path, row?.id ?? nextId(), row ?? undefined);
      if (!entry) continue;
      index.upsert(entry);
      changed.push(entry.id);
      if (!row) structure = true;
    }
    return { noteIds: changed, structure };
  }
}
