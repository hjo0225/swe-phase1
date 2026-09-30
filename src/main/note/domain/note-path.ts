import type { FolderName, NoteName } from './names';

const ABSOLUTE = /^([a-zA-Z]:|[\\/])/;

/** 숨김 폴더(`.git`, `.obsidian` …)와 `node_modules`는 보관함의 노트로 보지 않는다 (BR-VAULT-01). */
export function isHiddenSegment(segment: string): boolean {
  return segment.startsWith('.') || segment === 'node_modules';
}

function segmentsOf(raw: string): string[] {
  const segments = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '');
  if (segments.some((s) => s === '..' || s === '.' || isHiddenSegment(s))) {
    throw new Error(`Path escapes the vault or is hidden: ${raw}`);
  }
  return segments;
}

/** 보관함 기준 폴더 경로. 맨 위는 ''. */
export class FolderPath {
  private constructor(readonly value: string) {}

  static of(raw: string): FolderPath {
    if (/^[a-zA-Z]:/.test(raw)) throw new Error(`Absolute folder path: ${raw}`);
    return new FolderPath(segmentsOf(raw).join('/'));
  }

  static root(): FolderPath {
    return new FolderPath('');
  }

  get isRoot(): boolean {
    return this.value === '';
  }

  get name(): string {
    return this.value.split('/').pop() ?? '';
  }

  get parent(): FolderPath {
    return new FolderPath(this.value.split('/').slice(0, -1).join('/'));
  }

  child(name: FolderName): FolderPath {
    return new FolderPath(this.isRoot ? name.value : `${this.value}/${name.value}`);
  }

  /** 이 폴더 안(하위 포함)의 경로인지 */
  contains(path: string): boolean {
    return this.isRoot || path.toLowerCase().startsWith(`${this.value.toLowerCase()}/`);
  }
}

/** 보관함 기준 노트 경로. `/` 구분, `.md`로 끝난다. */
export class NotePath {
  private constructor(readonly value: string) {}

  static of(raw: string): NotePath {
    if (ABSOLUTE.test(raw)) throw new Error(`Absolute note path: ${raw}`);
    const segments = segmentsOf(raw);
    if (segments.length === 0 || !/\.md$/i.test(segments[segments.length - 1]!)) {
      throw new Error(`Not a markdown note path: ${raw}`);
    }
    return new NotePath(segments.join('/'));
  }

  static in(folder: FolderPath, name: NoteName): NotePath {
    return new NotePath(folder.isRoot ? `${name.value}.md` : `${folder.value}/${name.value}.md`);
  }

  /** 노트 이름 = 제목 */
  get name(): string {
    return this.value.split('/').pop()!.replace(/\.md$/i, '');
  }

  get folder(): string {
    return this.value.split('/').slice(0, -1).join('/');
  }

  /** 확장자 없는 경로 — `[[…]]`에 경로로 적을 때 */
  get linkTarget(): string {
    return this.value.replace(/\.md$/i, '');
  }

  withName(name: NoteName): NotePath {
    return NotePath.in(FolderPath.of(this.folder), name);
  }

  inFolder(folder: FolderPath): NotePath {
    return new NotePath(folder.isRoot ? `${this.name}.md` : `${folder.value}/${this.name}.md`);
  }
}
