/**
 * `[[노트 이름]]` 링크 규칙 — Shared Kernel (D-15, BR-NOTE-03).
 * Main(백링크, 이름 변경 시 링크 고치기)과 Renderer(링크 표시·이동·삽입)가 같은 규칙을 쓴다.
 * 규칙은 옵시디언과 맞춘다: 경로가 같으면 그 노트, 아니면 이름이 같은 노트 중 경로가 가장 짧은 것.
 */

export interface LinkableNote {
  id: string;
  /** 보관함 기준 경로, `/` 구분, `.md`로 끝남 */
  path: string;
}

/** `[[대상]]`, `[[대상|별칭]]` */
const WIKI_LINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*?))?\]\]/g;

const withoutExtension = (path: string) => path.replace(/\.md$/i, '');
const pathKey = (path: string) => withoutExtension(path).toLowerCase();
const nameKey = (path: string) => pathKey(path).split('/').pop()!;

/** 대상 텍스트에서 `#제목`·`^블록`을 떼고 비교용 키로 만든다. */
export function targetKey(target: string): string {
  return withoutExtension(target.split(/[#^]/)[0]!.trim().replace(/\\/g, '/')).toLowerCase();
}

export function resolveLinkTarget<N extends LinkableNote>(target: string, notes: readonly N[]): N | null {
  const key = targetKey(target);
  if (!key) return null;
  const exact = notes.find((n) => pathKey(n.path) === key);
  if (exact) return exact;
  const candidates = key.includes('/')
    ? notes.filter((n) => pathKey(n.path).endsWith(`/${key}`))
    : notes.filter((n) => nameKey(n.path) === key);
  return [...candidates].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0] ?? null;
}

/** 새로 넣는 링크의 대상: 이름이 보관함에서 유일하면 이름, 아니면 확장자 없는 경로. */
export function linkTargetFor(path: string, allPaths: readonly string[]): string {
  const name = withoutExtension(path).split('/').pop()!;
  const sameName = allPaths.filter((p) => nameKey(p) === name.toLowerCase()).length;
  return sameName > 1 ? withoutExtension(path) : name;
}

/** 본문의 링크 대상(원문 그대로, `#`·`^` 포함). 코드 블록·인라인 코드 안은 제외. */
export function extractLinkTargets(markdown: string): string[] {
  const targets: string[] = [];
  mapOutsideCode(markdown, (text) => {
    for (const match of text.matchAll(WIKI_LINK)) targets.push(match[1]!.trim());
    return text;
  });
  return targets;
}

/**
 * 링크의 대상만 바꾼다. `replace`는 `#`·`^` 앞부분(대상 이름)을 받아 새 이름을 돌려주거나 null(그대로)을 돌려준다.
 * 별칭과 `#제목` 부분, 코드 안의 텍스트는 건드리지 않는다.
 */
export function rewriteLinkTargets(markdown: string, replace: (target: string) => string | null): string {
  return mapOutsideCode(markdown, (text) =>
    text.replace(WIKI_LINK, (full, rawTarget: string, alias: string | undefined) => {
      const cut = rawTarget.search(/[#^]/);
      const base = (cut >= 0 ? rawTarget.slice(0, cut) : rawTarget).trim();
      const suffix = cut >= 0 ? rawTarget.slice(cut) : '';
      const next = replace(base);
      if (next === null) return full;
      return `[[${next}${suffix}${alias === undefined ? '' : `|${alias}`}]]`;
    }),
  );
}

/** 펜스 코드 블록(``` 또는 ~~~)과 인라인 코드(`…`) 밖의 텍스트에만 fn을 적용한다. */
function mapOutsideCode(markdown: string, fn: (text: string) => string): string {
  const out: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buffer.length === 0) return;
    out.push(
      buffer
        .join('\n')
        .split(/(`+[^`\n]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : fn(part)))
        .join(''),
    );
    buffer = [];
  };
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence === null && marker) {
      flush();
      fence = marker[0]!;
      out.push(line);
    } else if (fence !== null) {
      out.push(line);
      if (marker && marker[0] === fence && line.trim() === marker) fence = null;
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out.join('\n');
}
