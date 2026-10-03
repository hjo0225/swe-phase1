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

/** AI 분류 중에는 보관함 구조를 바꾸지 못한다 (organize의 OrganizeLock). */
export interface StructureGuard {
  assertIdle(): void;
}

export interface NoteIpcDeps {
  vaults: Pick<VaultManager<NoteVaultSession>, 'current' | 'open' | 'listRecent' | 'session'>;
  /** 폴더 선택 Dialog. 취소하면 null */
  chooseFolder(): Promise<string | null>;
  lock?: StructureGuard;
}

export function noteIpcHandlers({ vaults, chooseFolder, lock }: NoteIpcDeps): IpcHandlerMap {
  const notes = () => vaults.session().notes;
  const folders = () => vaults.session().folders;
  /** 구조를 바꾸는 요청: 분류 중이면 VAULT_BUSY */
  const guarded = <T>(run: () => T): T => {
    lock?.assertIdle();
    return run();
  };
  return {
    [IpcChannels.vaultGetCurrent]: createIpcHandler(EmptyRequest, () => vaults.current()),
    [IpcChannels.vaultChoose]: createIpcHandler(EmptyRequest, async (): Promise<VaultInfo | null> => {
      lock?.assertIdle();
      const root = await chooseFolder();
      lock?.assertIdle(); // Dialog가 열린 사이 분류가 시작됐을 수 있다
      return root ? vaults.open(root) : null;
    }),
    [IpcChannels.vaultOpen]: createIpcHandler(VaultOpenRequest, (r) => guarded(() => vaults.open(r.root))),
    [IpcChannels.vaultListRecent]: createIpcHandler(EmptyRequest, () => vaults.listRecent()),

    [IpcChannels.noteTree]: createIpcHandler(EmptyRequest, () => notes().tree()),
    [IpcChannels.noteCreate]: createIpcHandler(CreateNoteRequest, (r) => guarded(() => notes().create(r))),
    [IpcChannels.noteGet]: createIpcHandler(NoteIdRequest, (r) => notes().get(r.id)),
    [IpcChannels.noteUpdate]: createIpcHandler(UpdateNoteRequest, (r) => notes().update(r)),
    [IpcChannels.noteRename]: createIpcHandler(RenameNoteRequest, (r) => guarded(() => notes().rename(r))),
    [IpcChannels.noteMove]: createIpcHandler(MoveNoteRequest, (r) => guarded(() => notes().move(r))),
    [IpcChannels.noteDelete]: createIpcHandler(NoteIdRequest, (r) => guarded(() => notes().delete(r.id))),
    [IpcChannels.noteSearch]: createIpcHandler(SearchNotesRequest, (r) => notes().search(r)),
    [IpcChannels.noteLinkList]: createIpcHandler(NoteLinksRequest, (r) => notes().listLinks(r.noteId)),

    [IpcChannels.folderCreate]: createIpcHandler(CreateFolderRequest, (r) => guarded(() => folders().create(r))),
    [IpcChannels.folderRename]: createIpcHandler(RenameFolderRequest, (r) => guarded(() => folders().rename(r))),
    [IpcChannels.folderDelete]: createIpcHandler(FolderPathRequest, (r) => guarded(() => folders().delete(r))),
  };
}
