import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc/channels';
import { EmptyRequest } from '../shared/ipc/schemas';
import { openDatabase } from './platform/db/connection';
import { createIpcHandler } from './platform/ipc/handler';
import { registerIpcHandler } from './platform/ipc/register';
import { createSenderValidator } from './platform/ipc/sender';
import { createMainWindow } from './window';

/** Composition Root. 순서는 docs/02-architecture.md "앱 시작 순서"를 따른다. */
export function bootstrap(): void {
  const database = openDatabase(join(app.getPath('userData'), 'blink.db'));
  app.on('will-quit', () => database.close());

  const isTrusted = createSenderValidator({
    devServerUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  });
  registerIpcHandler(
    ipcMain,
    IpcChannels.appGetInfo,
    createIpcHandler(EmptyRequest, () => ({ version: app.getVersion() })),
    isTrusted,
  );

  // Renderer의 첫 호출이 유실되지 않도록 IPC 등록 후에 창을 만든다.
  createMainWindow();
}
