import { contextBridge, ipcRenderer } from 'electron';
import { createRawBlinkApi } from './raw-api';

contextBridge.exposeInMainWorld(
  'blink',
  createRawBlinkApi((channel, request) => ipcRenderer.invoke(channel, request)),
);
