import { app, BrowserWindow, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F3F8FF',
    title: 'Blink',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // 외부 링크(구체화 출처 등)는 앱 안에서 열지 않고 기본 브라우저로 넘긴다.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));

  captureForSmokeTest(window);
  return window;
}

/** 개발 전용: BLINK_CAPTURE=<png 경로>로 실행하면 첫 화면을 저장하고 종료한다 (시각 검증용). */
function captureForSmokeTest(window: BrowserWindow): void {
  const target = process.env.BLINK_CAPTURE;
  if (app.isPackaged || !target) return;
  window.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void window.webContents
        .capturePage()
        .then((image) => writeFile(target, image.toPNG()))
        .finally(() => app.quit());
    }, 1500);
  });
}
