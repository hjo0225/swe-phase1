import { posix } from 'node:path';

/** 노트에서 보여 줄 수 있는 이미지 형식 */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function imageTypeOf(path: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return (ext && IMAGE_TYPES[ext]) || null;
}

/**
 * 노트 속 이미지 경로 → 보관함 안의 이미지 파일 (보관함 기준 `/` 경로). 없거나 허용하지 않으면 null.
 * 옵시디언처럼 찾는다: 노트 기준 상대 경로 → 보관함 기준 경로 → 같은 이름의 파일(대소문자 무시, 가장 얕은 것).
 * 그래서 다른 폴더의 노트로 가져온 이미지도 보인다. 보관함 밖·원격·절대 경로·이미지가 아닌 파일은 내주지 않는다.
 */
export function resolveVaultImage(input: {
  src: string;
  /** 노트가 든 폴더 (보관함 기준, 맨 위는 '') */
  noteFolder: string;
  exists(path: string): boolean;
  listFiles(): string[];
}): string | null {
  const raw = input.src.trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[\\/]/.test(raw)) return null;

  const decoded = safeDecode(raw);
  const candidates = [...new Set([raw, decoded])].map((s) => s.replace(/\\/g, '/'));
  const inside = (path: string) => {
    const normal = posix.normalize(path);
    return normal.startsWith('../') || normal === '..' || posix.isAbsolute(normal) ? null : normal;
  };
  const usable = (path: string | null): path is string => path !== null && imageTypeOf(path) !== null && input.exists(path);

  for (const src of candidates) {
    const fromNote = inside(posix.join(input.noteFolder, src));
    if (usable(fromNote)) return fromNote;
  }
  for (const src of candidates) {
    const fromRoot = inside(src);
    if (usable(fromRoot)) return fromRoot;
  }
  // 경로가 보관함 밖을 가리키면 이름으로도 찾지 않는다
  if (candidates.some((src) => inside(posix.join(input.noteFolder, src)) === null)) return null;
  const names = new Set(candidates.map((src) => posix.basename(src).toLowerCase()));
  const byName = input
    .listFiles()
    .filter((path) => names.has(posix.basename(path).toLowerCase()) && imageTypeOf(path) !== null)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return byName[0] ?? null;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
