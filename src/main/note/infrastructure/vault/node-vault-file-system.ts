import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch as watchFs,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { isHiddenSegment } from '../../domain/note-path';

export interface FileStat {
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
}

export interface VaultFileSystem {
  readonly root: string;
  listMarkdownFiles(): ({ path: string } & FileStat)[];
  listFolders(): string[];
  read(path: string): string;
  stat(path: string): FileStat | null;
  writeAtomic(path: string, text: string): void;
  createExclusive(path: string, text: string): void;
  rename(from: string, to: string): void;
  /** 보관함 밖 파일(절대 경로)을 보관함 경로로 복사한다. 이미 있으면 덮지 않고 실패한다. */
  copyIn(sourceAbsolute: string, to: string): void;
  /** 보관함 밖 파일(절대 경로)을 지운다 — 가져오기가 끝난 원본 */
  removeExternal(sourceAbsolute: string): void;
  remove(path: string): void;
  makeFolder(path: string): void;
  removeFolder(path: string): void;
  exists(path: string): boolean;
  watch(onChange: (paths: string[]) => void): () => void;
}

const TEMP_SUFFIX = '.blink-tmp';
const WATCH_DEBOUNCE_MS = 300;

/** 보관함 폴더의 파일 원본 (docs/backend/note/repositories.md). 경로는 보관함 기준 `/` 구분. */
export class NodeVaultFileSystem implements VaultFileSystem {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  listMarkdownFiles(): ({ path: string } & FileStat)[] {
    const files: ({ path: string } & FileStat)[] = [];
    this.walk('', (path, isDirectory) => {
      if (!isDirectory && /\.md$/i.test(path)) {
        const stat = this.stat(path);
        if (stat) files.push({ path, ...stat });
      }
    });
    return files;
  }

  listFolders(): string[] {
    const folders: string[] = [];
    this.walk('', (path, isDirectory) => {
      if (isDirectory) folders.push(path);
    });
    return folders;
  }

  read(path: string): string {
    return readFileSync(this.absolute(path), 'utf8');
  }

  stat(path: string): FileStat | null {
    try {
      const s = statSync(this.absolute(path));
      return { size: s.size, mtimeMs: Math.floor(s.mtimeMs), birthtimeMs: Math.floor(s.birthtimeMs || s.mtimeMs) };
    } catch {
      return null;
    }
  }

  /** 같은 폴더의 임시 파일에 쓴 뒤 바꿔 끼운다 — 쓰는 도중 끊겨도 원본이 깨지지 않는다. */
  writeAtomic(path: string, text: string): void {
    const target = this.absolute(path);
    const temp = join(dirname(target), `.${target.split(sep).pop()}${TEMP_SUFFIX}`);
    writeFileSync(temp, text, 'utf8');
    renameSync(temp, target);
  }

  createExclusive(path: string, text: string): void {
    writeFileSync(this.absolute(path), text, { encoding: 'utf8', flag: 'wx' });
  }

  rename(from: string, to: string): void {
    renameSync(this.absolute(from), this.absolute(to));
  }

  copyIn(sourceAbsolute: string, to: string): void {
    copyFileSync(sourceAbsolute, this.absolute(to), constants.COPYFILE_EXCL);
  }

  removeExternal(sourceAbsolute: string): void {
    rmSync(sourceAbsolute);
  }

  remove(path: string): void {
    rmSync(this.absolute(path));
  }

  makeFolder(path: string): void {
    mkdirSync(this.absolute(path));
  }

  removeFolder(path: string): void {
    rmSync(this.absolute(path), { recursive: true, force: true });
  }

  exists(path: string): boolean {
    return existsSync(this.absolute(path));
  }

  /** 다른 앱이 바꾼 경로를 300ms씩 모아 알린다. 숨김 폴더·임시 파일은 무시한다. */
  watch(onChange: (paths: string[]) => void): () => void {
    let pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watchFs(this.root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const path = filename.toString().split(sep).join('/');
      if (path.split('/').some(isHiddenSegment) || path.endsWith(TEMP_SUFFIX)) return;
      pending.add(path);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = [...pending];
        pending = new Set();
        onChange(paths);
      }, WATCH_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }

  private absolute(path: string): string {
    const target = resolve(this.root, ...path.split('/'));
    const rel = relative(this.root, target);
    if (rel.startsWith('..') || resolve(this.root, rel) !== target) throw new Error(`Path escapes the vault: ${path}`);
    return target;
  }

  private walk(folder: string, visit: (path: string, isDirectory: boolean) => void): void {
    let entries;
    try {
      entries = readdirSync(this.absolute(folder), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isHiddenSegment(entry.name)) continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(path, true);
        this.walk(path, visit);
      } else if (entry.isFile()) {
        visit(path, false);
      }
    }
  }
}
