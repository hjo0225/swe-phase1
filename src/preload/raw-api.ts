import type { AppInfo, RawBlinkApi } from '../shared/ipc/blink-api';
import { IpcChannels } from '../shared/ipc/channels';
import type { IpcResult } from '../shared/ipc/result';

export type Invoke = (channel: string, request: unknown) => Promise<unknown>;

export function createRawBlinkApi(invoke: Invoke): RawBlinkApi {
  const call = <T>(channel: string, request: unknown) => invoke(channel, request) as Promise<IpcResult<T>>;
  return {
    app: { getInfo: () => call<AppInfo>(IpcChannels.appGetInfo, {}) },
  };
}
