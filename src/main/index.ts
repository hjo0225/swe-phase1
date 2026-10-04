import { app, BrowserWindow } from 'electron';
import { bootstrap } from './bootstrap';
import { registerVaultImageScheme } from './note/presentation/vault-image-protocol';

// 노트 속 이미지 주소(blink-vault:)는 app ready 전에 등록해야 한다
registerVaultImageScheme();

void app.whenReady().then(() => {
  const { openWindow } = bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
