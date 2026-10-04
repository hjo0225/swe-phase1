import { app, BrowserWindow, shell, type WebPreferences } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 앱의 모든 창(메인·인쇄)이 같은 보안 설정을 쓴다. */
export function secureWebPreferences(): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
}

/** 새 창을 열지 않고, 앱 화면 밖으로 이동하지 않는다. 외부 링크만 기본 브라우저로 넘긴다. */
export function lockNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
}

/** 앱 자신의 Renderer만 불러온다 (개발: dev 서버, 그 밖: 번들 파일). route는 hash 경로 (예: /print/<id>) */
export function loadRenderer(window: BrowserWindow, route?: string): Promise<void> {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) return window.loadURL(route ? `${devServerUrl}#${route}` : devServerUrl);
  return window.loadFile(join(__dirname, '../renderer/index.html'), route ? { hash: route } : undefined);
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F3F8FF',
    title: 'Blink',
    webPreferences: secureWebPreferences(),
  });

  window.once('ready-to-show', () => window.show());

  // 외부 링크(구체화 출처 등)는 앱 안에서 열지 않고 기본 브라우저로 넘긴다.
  lockNavigation(window);
  void loadRenderer(window);

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
