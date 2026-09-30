import type { NoteSummary } from '../../../../shared/ipc/notes';
import type { Clock, IdGenerator } from '../../../platform/clock';
import { previewOf } from '../../domain/note-text';
import { MarkdownContent } from '../../domain/markdown-content';
import { NotePath } from '../../domain/note-path';
import type { VaultFileSystem } from '../../infrastructure/vault/node-vault-file-system';
import type { NoteIndex, NoteIndexEntry, NoteIndexRow } from '../../infrastructure/vault/sqlite-note-index';

/** 열린 보관함 하나의 유스케이스들이 함께 쓰는 의존성. */
export interface VaultDeps {
  fs: VaultFileSystem;
  index: NoteIndex;
  clock: Clock;
  nextId: IdGenerator;
}

/** 파일을 읽어 색인 항목을 만든다. 파일이 없으면 null. */
export function readEntry(fs: VaultFileSystem, path: string, id: string, existing?: NoteIndexRow): NoteIndexEntry | null {
  const stat = fs.stat(path);
  if (!stat) return null;
  const content = MarkdownContent.fromMarkdown(fs.read(path));
  return {
    id,
    path,
    plainText: content.plainText,
    linkTargets: content.linkTargets,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    createdAt: existing?.createdAt ?? new Date(stat.birthtimeMs),
    updatedAt: new Date(stat.mtimeMs),
  };
}

export function toSummary(row: NoteIndexRow): NoteSummary {
  const path = NotePath.of(row.path);
  return {
    id: row.id,
    title: path.name,
    path: path.value,
    folder: path.folder,
    preview: previewOf(row.plainText),
    updatedAt: row.updatedAt.toISOString(),
  };
}
