import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { createRawBlinkApi } from './raw-api';

contextBridge.exposeInMainWorld(
  'blink',
  createRawBlinkApi(
    (channel, request) => ipcRenderer.invoke(channel, request),
    (channel, listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    // Electron 32부터 File.path가 없어져 webUtils로 끌어다 놓은 파일의 경로를 읽는다.
    (file) => webUtils.getPathForFile(file),
  ),
);
