import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
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
  ),
);
