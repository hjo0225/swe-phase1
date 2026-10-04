import { app, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SaveFileKind {
  /** Dialog 제목 (예: 'Export PDF') */
  title: string;
  /** 파일 형식 필터 이름 (예: 'PDF document') */
  filterName: string;
  /** 점 없는 확장자 (예: 'pdf') */
  extension: string;
}

/** 현재 창에 모달 Save Dialog를 띄우고(기본 위치: 다운로드 폴더) 사용자가 고른 경로에만 쓴다. */
export class DialogFileSaver {
  constructor(private readonly kind: SaveFileKind) {}

  async askSavePath(defaultFileName: string): Promise<string | null> {
    const options = {
      title: this.kind.title,
      defaultPath: join(app.getPath('downloads'), defaultFileName),
      filters: [{ name: this.kind.filterName, extensions: [this.kind.extension] }],
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
export class FixedPathSaver extends DialogFileSaver {
  constructor(
    kind: SaveFileKind,
    private readonly path: string,
  ) {
    super(kind);
  }

  override async askSavePath(): Promise<string | null> {
    return this.path;
  }
}
