import { DomainError } from '../../../platform/errors';
import { FolderName } from '../../domain/names';
import { FolderPath } from '../../domain/note-path';
import { relinkAfterMoves } from './link-maintenance';
import type { VaultDeps } from './vault-deps';

/** UC-FOLDER-001~003. 폴더 = 보관함 안의 실제 폴더. */
export class FolderService {
  constructor(private readonly deps: VaultDeps) {}

  create(input: { parent?: string; name: string }): { path: string } {
    const parent = this.existing(input.parent ?? '');
    const path = parent.child(FolderName.of(input.name));
    if (this.deps.fs.exists(path.value)) throw new DomainError('FOLDER_NAME_TAKEN', `${path.value} already exists`);
    this.deps.fs.makeFolder(path.value);
    return { path: path.value };
  }

  rename(input: { path: string; name: string }): { path: string; updatedNoteIds: string[] } {
    const { fs, index } = this.deps;
    const folder = this.existing(input.path);
    if (folder.isRoot) throw new DomainError('FOLDER_NOT_FOUND', 'The vault root cannot be renamed');
    const next = folder.parent.child(FolderName.of(input.name));
    if (next.value === folder.value) return { path: folder.value, updatedNoteIds: [] };
    if (next.value.toLowerCase() !== folder.value.toLowerCase() && fs.exists(next.value)) {
      throw new DomainError('FOLDER_NAME_TAKEN', `${next.value} already exists`);
    }

    const before = index.all();
    fs.rename(folder.value, next.value);
    const moved = new Map<string, string>();
    for (const row of before.filter((r) => folder.contains(r.path))) {
      const nextPath = `${next.value}${row.path.slice(folder.value.length)}`;
      index.movePath(row.id, nextPath);
      moved.set(row.id, nextPath);
    }
    return { path: next.value, updatedNoteIds: relinkAfterMoves(this.deps, before, moved) };
  }

  delete(input: { path: string }): { deletedNotes: number } {
    const folder = this.existing(input.path);
    if (folder.isRoot) throw new DomainError('FOLDER_NOT_FOUND', 'The vault root cannot be deleted');
    const inside = this.deps.index.all().filter((r) => folder.contains(r.path));
    this.deps.fs.removeFolder(folder.value);
    for (const row of inside) this.deps.index.remove(row.id);
    return { deletedNotes: inside.length };
  }

  private existing(raw: string): FolderPath {
    const folder = FolderPath.of(raw);
    if (!folder.isRoot && !this.deps.fs.exists(folder.value)) {
      throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder.value} not found`);
    }
    return folder;
  }
}
