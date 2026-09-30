import type { AIJobView } from '../shared/ipc/assist';
import type { RawBlinkApi } from '../shared/ipc/blink-api';
import { IpcChannels, IpcEvents } from '../shared/ipc/channels';
import type { IpcResult } from '../shared/ipc/result';

export type Invoke = (channel: string, request: unknown) => Promise<unknown>;
export type Subscribe = (channel: string, listener: (payload: unknown) => void) => () => void;

export function createRawBlinkApi(invoke: Invoke, subscribe: Subscribe): RawBlinkApi {
  const call = <T>(channel: string, request: unknown = {}) => invoke(channel, request) as Promise<IpcResult<T>>;
  return {
    app: {
      getInfo: () => call(IpcChannels.appGetInfo),
      onWillClose: (listener) => subscribe(IpcEvents.appWillClose, () => listener()),
      readyToClose: () => call(IpcChannels.appReadyToClose),
    },
    notes: {
      create: (input) => call(IpcChannels.noteCreate, input),
      list: () => call(IpcChannels.noteList),
      get: (input) => call(IpcChannels.noteGet, input),
      update: (input) => call(IpcChannels.noteUpdate, input),
      delete: (input) => call(IpcChannels.noteDelete, input),
      search: (input) => call(IpcChannels.noteSearch, input),
      listLinks: (input) => call(IpcChannels.noteLinkList, input),
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
  };
}
