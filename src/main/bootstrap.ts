import { app, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc/channels';
import { EmptyRequest } from '../shared/ipc/schemas';
import { createCloseCoordinator } from './app/close-coordinator';
import { NoteService } from './note/application/note-service';
import { DrizzleNoteRepository } from './note/infrastructure/drizzle-note-repository';
import { noteIpcHandlers } from './note/presentation/note.ipc';
import { systemClock, uuid } from './platform/clock';
import { openDatabase } from './platform/db/connection';
import { runMigrations } from './platform/db/migrate';
import { migrations } from './platform/db/migrations';
import { createIpcHandler } from './platform/ipc/handler';
import { registerIpcHandlers } from './platform/ipc/register';
import { createSenderValidator } from './platform/ipc/sender';
import { createMainWindow } from './window';

const CLOSE_FLUSH_TIMEOUT_MS = 3000;

/** Composition Root. 순서는 docs/02-architecture.md "앱 시작 순서"를 따른다. */
export function bootstrap(): { openWindow: () => BrowserWindow } {
  const database = openDatabase(join(app.getPath('userData'), 'blink.db'));
  runMigrations(database.sqlite, migrations);
  app.on('will-quit', () => database.close());

  const noteService = new NoteService(new DrizzleNoteRepository(database.db), systemClock, uuid);

  // 창마다 하나. 현재는 단일 창이라 가장 최근 창의 coordinator에 release를 전달한다.
  let releaseClose = () => {};

  const isTrusted = createSenderValidator({
    devServerUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  });
  registerIpcHandlers(
    ipcMain,
    {
      [IpcChannels.appGetInfo]: createIpcHandler(EmptyRequest, () => ({ version: app.getVersion() })),
      [IpcChannels.appReadyToClose]: createIpcHandler(EmptyRequest, () => releaseClose()),
      ...noteIpcHandlers(noteService),
    },
    isTrusted,
  );

  // Renderer의 첫 호출이 유실되지 않도록 IPC 등록 후에 창을 만든다.
  const openWindow = () => {
    const window = createMainWindow();
    const coordinator = createCloseCoordinator(window, { timeoutMs: CLOSE_FLUSH_TIMEOUT_MS });
    releaseClose = () => coordinator.release();
    return window;
  };
  openWindow();
  return { openWindow };
}
