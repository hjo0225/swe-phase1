import type { IpcMain } from 'electron';
import type { IpcResult } from '../../../shared/ipc/result';

export type IpcHandler = (raw: unknown) => Promise<IpcResult<unknown>>;
export type IpcHandlerMap = Record<string, IpcHandler>;

export function registerIpcHandler(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  handler: IpcHandler,
  isTrustedFrameUrl: (url: string | undefined) => boolean,
): void {
  ipcMain.handle(channel, (event, raw: unknown) => {
    if (!isTrustedFrameUrl(event.senderFrame?.url)) {
      const rejected: IpcResult<never> = { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Untrusted sender' } };
      return rejected;
    }
    return handler(raw);
  });
}

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  handlers: IpcHandlerMap,
  isTrustedFrameUrl: (url: string | undefined) => boolean,
): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    registerIpcHandler(ipcMain, channel, handler, isTrustedFrameUrl);
  }
}
