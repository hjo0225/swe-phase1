import { linkTargetFor, resolveLinkTarget, rewriteLinkTargets } from '../../../../shared/notes/wiki-link';
import type { NoteIndexRow } from '../../infrastructure/vault/sqlite-note-index';
import { readEntry, type VaultDeps } from './vault-deps';

/** 경로 `a/b/c.md`로 이 노트를 가리킬 수 있는 대상 키들: `c`, `b/c`, `a/b/c` */
export function targetKeysFor(path: string): string[] {
  const segments = path.replace(/\.md$/i, '').toLowerCase().split('/');
  return segments.map((_, i) => segments.slice(i).join('/'));
}

/**
 * 노트가 이름 변경·이동으로 새 경로를 가졌을 때, 그 노트를 가리키던 `[[링크]]`를 새 대상으로 고친다 (UC-NOTE-010).
 * @param before 이동 전 색인 (옛 대상 해석용)
 * @param moved 노트 ID → 새 경로
 * @returns 링크를 고친 노트 ID
 */
export function relinkAfterMoves(deps: VaultDeps, before: readonly NoteIndexRow[], moved: ReadonlyMap<string, string>): string[] {
  const { fs, index } = deps;
  const keys = before.filter((row) => moved.has(row.id)).flatMap((row) => targetKeysFor(row.path));
  const afterPaths = index.all().map((row) => row.path);
  const updated: string[] = [];

  for (const sourceId of index.sourcesLinkingTo(keys)) {
    const source = index.findById(sourceId);
    if (!source) continue;
    const markdown = fs.read(source.path);
    const rewritten = rewriteLinkTargets(markdown, (target) => {
      const resolved = resolveLinkTarget(target, before);
      const newPath = resolved ? moved.get(resolved.id) : undefined;
      if (!newPath) return null;
      // 사용자가 경로로 적은 링크는 경로로, 이름으로 적은 링크는 가장 짧은 이름으로 둔다.
      const next = target.includes('/') ? newPath.replace(/\.md$/i, '') : linkTargetFor(newPath, afterPaths);
      return next.toLowerCase() === target.toLowerCase() ? null : next;
    });
    if (rewritten === markdown) continue;
    fs.writeAtomic(source.path, rewritten);
    const entry = readEntry(fs, source.path, source.id, source);
    if (entry) index.upsert(entry);
    updated.push(source.id);
  }
  return updated;
}
