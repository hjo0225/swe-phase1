import { IpcChannels } from '../../../shared/ipc/channels';
import type { VaultInfo } from '../../../shared/ipc/notes';
import {
  CreateFolderRequest,
  CreateNoteRequest,
  EmptyRequest,
  FolderPathRequest,
  MoveNoteRequest,
  NoteIdRequest,
  NoteLinksRequest,
  RenameFolderRequest,
  RenameNoteRequest,
  SearchNotesRequest,
  UpdateNoteRequest,
  VaultOpenRequest,
} from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { NoteVaultSession, VaultManager } from '../application/vault/vault-manager';

export interface NoteIpcDeps {
  vaults: Pick<VaultManager<NoteVaultSession>, 'current' | 'open' | 'listRecent' | 'session'>;
  /** 폴더 선택 Dialog. 취소하면 null */
  chooseFolder(): Promise<string | null>;
}

export function noteIpcHandlers({ vaults, chooseFolder }: NoteIpcDeps): IpcHandlerMap {
  const notes = () => vaults.session().notes;
  const folders = () => vaults.session().folders;
  return {
    [IpcChannels.vaultGetCurrent]: createIpcHandler(EmptyRequest, () => vaults.current()),
    [IpcChannels.vaultChoose]: createIpcHandler(EmptyRequest, async (): Promise<VaultInfo | null> => {
      const root = await chooseFolder();
      return root ? vaults.open(root) : null;
    }),
    [IpcChannels.vaultOpen]: createIpcHandler(VaultOpenRequest, (r) => vaults.open(r.root)),
    [IpcChannels.vaultListRecent]: createIpcHandler(EmptyRequest, () => vaults.listRecent()),

    [IpcChannels.noteTree]: createIpcHandler(EmptyRequest, () => notes().tree()),
    [IpcChannels.noteCreate]: createIpcHandler(CreateNoteRequest, (r) => notes().create(r)),
    [IpcChannels.noteGet]: createIpcHandler(NoteIdRequest, (r) => notes().get(r.id)),
    [IpcChannels.noteUpdate]: createIpcHandler(UpdateNoteRequest, (r) => notes().update(r)),
    [IpcChannels.noteRename]: createIpcHandler(RenameNoteRequest, (r) => notes().rename(r)),
    [IpcChannels.noteMove]: createIpcHandler(MoveNoteRequest, (r) => notes().move(r)),
    [IpcChannels.noteDelete]: createIpcHandler(NoteIdRequest, (r) => notes().delete(r.id)),
    [IpcChannels.noteSearch]: createIpcHandler(SearchNotesRequest, (r) => notes().search(r)),
    [IpcChannels.noteLinkList]: createIpcHandler(NoteLinksRequest, (r) => notes().listLinks(r.noteId)),

    [IpcChannels.folderCreate]: createIpcHandler(CreateFolderRequest, (r) => folders().create(r)),
    [IpcChannels.folderRename]: createIpcHandler(RenameFolderRequest, (r) => folders().rename(r)),
    [IpcChannels.folderDelete]: createIpcHandler(FolderPathRequest, (r) => folders().delete(r)),
  };
}
