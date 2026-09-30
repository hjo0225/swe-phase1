import type { IpcMain } from 'electron';
import type { IpcResult } from '../../../shared/ipc/result';

export function registerIpcHandler(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  handler: (raw: unknown) => Promise<IpcResult<unknown>>,
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
