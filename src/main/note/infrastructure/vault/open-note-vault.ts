import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Clock, IdGenerator } from '../../../platform/clock';
import { FolderService } from '../../application/vault/folder-service';
import { IndexSync } from '../../application/vault/index-sync';
import { imageTypeOf, resolveVaultImage } from '../../application/vault/resolve-vault-image';
import type { NoteVaultSession } from '../../application/vault/vault-manager';
import { VaultNoteService } from '../../application/vault/vault-note-service';
import { NodeVaultFileSystem } from './node-vault-file-system';
import { SqliteNoteIndex } from './sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from './vault-index-db';

/** D-17: 보관함마다 userData/vaults/<경로 해시>.db. 보관함 폴더에는 아무것도 만들지 않는다. */
export function vaultIndexFile(indexDir: string, root: string): string {
  const key = resolve(root).toLowerCase();
  return join(indexDir, `${createHash('sha1').update(key).digest('hex')}.db`);
}

export interface OpenedNoteVault extends NoteVaultSession {
  readonly database: VaultIndexDatabase;
}

export function openNoteVault(root: string, options: { indexDir: string; clock: Clock; nextId: IdGenerator }): OpenedNoteVault {
  mkdirSync(options.indexDir, { recursive: true });
  const fs = new NodeVaultFileSystem(root);
  const database = openVaultIndex(vaultIndexFile(options.indexDir, root));
  const deps = { fs, index: new SqliteNoteIndex(database.db), clock: options.clock, nextId: options.nextId };
  const notes = new VaultNoteService(deps);
  return {
    root: fs.root,
    database,
    sync: new IndexSync(deps),
    notes,
    folders: new FolderService(deps),
    images: {
      resolve: (noteId, src) => {
        const note = notes.tree().notes.find((n) => n.id === noteId);
        if (!note) return null;
        const found = resolveVaultImage({ src, noteFolder: note.folder, exists: (path) => fs.exists(path), listFiles: () => fs.listFiles() });
        return found ? { path: join(fs.root, ...found.split('/')), type: imageTypeOf(found)! } : null;
      },
    },
    watch: (onChange) => fs.watch(onChange),
    close: () => database.close(),
  };
}
