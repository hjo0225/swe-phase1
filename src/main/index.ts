import { app, BrowserWindow } from 'electron';
import { bootstrap } from './bootstrap';

void app.whenReady().then(() => {
  const { openWindow } = bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
