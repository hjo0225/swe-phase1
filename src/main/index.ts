import { app, BrowserWindow } from 'electron';
import { bootstrap } from './bootstrap';
import { createMainWindow } from './window';

void app.whenReady().then(() => {
  bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
