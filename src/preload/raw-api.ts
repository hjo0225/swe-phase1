import type { AIJobView } from '../shared/ipc/assist';
import type { VaultChangedEvent } from '../shared/ipc/notes';
import type { RawBlinkApi } from '../shared/ipc/blink-api';
import { IpcChannels, IpcEvents } from '../shared/ipc/channels';
import type { IpcResult } from '../shared/ipc/result';

export type Invoke = (channel: string, request: unknown) => Promise<unknown>;
export type Subscribe = (channel: string, listener: (payload: unknown) => void) => () => void;

export function createRawBlinkApi(
  invoke: Invoke,
  subscribe: Subscribe,
  pathForFile: (file: File) => string = () => '',
): RawBlinkApi {
  const call = <T>(channel: string, request: unknown = {}) => invoke(channel, request) as Promise<IpcResult<T>>;
  return {
    app: {
      getInfo: () => call(IpcChannels.appGetInfo),
      onWillClose: (listener) => subscribe(IpcEvents.appWillClose, () => listener()),
      readyToClose: () => call(IpcChannels.appReadyToClose),
    },
    vault: {
      getCurrent: () => call(IpcChannels.vaultGetCurrent),
      choose: () => call(IpcChannels.vaultChoose),
      open: (input) => call(IpcChannels.vaultOpen, input),
      listRecent: () => call(IpcChannels.vaultListRecent),
      onChanged: (listener) => subscribe(IpcEvents.vaultChanged, (payload) => listener(payload as VaultChangedEvent)),
    },
    notes: {
      tree: () => call(IpcChannels.noteTree),
      create: (input) => call(IpcChannels.noteCreate, input),
      get: (input) => call(IpcChannels.noteGet, input),
      update: (input) => call(IpcChannels.noteUpdate, input),
      rename: (input) => call(IpcChannels.noteRename, input),
      move: (input) => call(IpcChannels.noteMove, input),
      delete: (input) => call(IpcChannels.noteDelete, input),
      exportPdf: (input) => call(IpcChannels.noteExportPdf, input),
      search: (input) => call(IpcChannels.noteSearch, input),
      listLinks: (input) => call(IpcChannels.noteLinkList, input),
    },
    folders: {
      create: (input) => call(IpcChannels.folderCreate, input),
      rename: (input) => call(IpcChannels.folderRename, input),
      delete: (input) => call(IpcChannels.folderDelete, input),
    },
    ai: {
      createJob: (input) => call(IpcChannels.aiCreateJob, input),
      getJob: (input) => call(IpcChannels.aiGetJob, input),
      listJobs: (input) => call(IpcChannels.aiListJobs, input),
      retryJob: (input) => call(IpcChannels.aiRetryJob, input),
      onJobUpdated: (listener) => subscribe(IpcEvents.aiJobUpdated, (payload) => listener(payload as AIJobView)),
    },
    visualization: {
      savePng: (input) => call(IpcChannels.visualizationSavePng, input),
    },
    settings: {
      getProvider: () => call(IpcChannels.settingsGetProvider),
      updateProvider: (input) => call(IpcChannels.settingsUpdateProvider, input),
      testProvider: (input) => call(IpcChannels.settingsTestProvider, input),
    },
    organize: {
      preview: (input) => call(IpcChannels.organizePreview, input),
      apply: (input) => call(IpcChannels.organizeApply, input),
      place: (input) => call(IpcChannels.organizePlace, input),
      importFile: (input) => call(IpcChannels.organizeImport, input),
      pathForFile,
    },
  };
}
