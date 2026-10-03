import { app, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileSaver } from '../application/export-infographic-png';

/** 현재 창에 모달 Save Dialog를 띄우고(기본 위치: 다운로드 폴더) 고른 경로에 쓴다. */
export class ElectronFileSaver implements FileSaver {
  async askSavePath(defaultFileName: string): Promise<string | null> {
    const options = {
      title: 'Save as PNG',
      defaultPath: join(app.getPath('downloads'), defaultFileName),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    };
    const parent = BrowserWindow.getFocusedWindow();
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    await writeFile(path, bytes);
  }
}

/** E2E 전용(개발 빌드에서만): Dialog 대신 정해진 경로에 저장한다. */
export class FixedPathFileSaver extends ElectronFileSaver {
  constructor(private readonly path: string) {
    super();
  }

  override async askSavePath(): Promise<string | null> {
    return this.path;
  }
}
