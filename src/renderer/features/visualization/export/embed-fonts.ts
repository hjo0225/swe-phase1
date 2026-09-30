import subsetCss from 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css?raw';

/**
 * PNG용 폰트 내장.
 * SVG를 <img>로 불러와 Canvas에 그리면 브라우저가 격리된 상태로 그려 문서의 웹 폰트(Pretendard)를 쓸 수 없다.
 * 그래서 인포그래픽에 실제로 쓰인 글자를 담은 Pretendard 조각(woff2)만 골라 SVG 안에 data URL로 넣는다.
 */

export const EXPORT_FONT_FAMILY = 'Blink Export';

export interface FontSubset {
  file: string;
  unicodeRange: string;
  ranges: [number, number][];
}

/**
 * 조각 파일은 저장할 때만 필요하므로 각각 따로(lazy) 불러온다. 값은 base64 data URL.
 * 경로는 이 파일 기준 상대 경로여야 한다 — `/node_modules`로 쓰면 Vite root(renderer 빌드는 src/renderer)
 * 기준으로 해석되어 빌드에서만 아무 파일도 찾지 못한다.
 */
const subsetLoaders = import.meta.glob<string>('../../../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/*.woff2', {
  query: '?inline',
  import: 'default',
});

const FACE = /src:\s*url\(\.\/woff2-dynamic-subset\/([^)]+\.woff2)\)[^;]*;\s*unicode-range:\s*([^;]+);/g;

export function parseFontSubsets(css: string): FontSubset[] {
  return [...css.matchAll(FACE)].map(([, file, range]) => {
    const unicodeRange = range!.trim();
    return {
      file: file!,
      unicodeRange,
      ranges: unicodeRange.split(',').map((part) => {
        const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-');
        return [parseInt(start!, 16), parseInt(end!, 16)] as [number, number];
      }),
    };
  });
}

/** 글자마다 그 글자를 담은 조각을 찾는다. 처음 등장한 순서대로, 중복 없이. */
export function pickSubsets(subsets: readonly FontSubset[], text: string): FontSubset[] {
  const picked: FontSubset[] = [];
  for (const char of new Set(text)) {
    const code = char.codePointAt(0)!;
    const subset = subsets.find((s) => s.ranges.some(([start, end]) => code >= start && code <= end));
    if (subset && !picked.includes(subset)) picked.push(subset);
  }
  return picked;
}

export function buildFontFaceCss(family: string, faces: { dataUrl: string; unicodeRange: string }[]): string {
  return faces
    .map(
      (f) =>
        `@font-face{font-family:'${family}';font-weight:45 920;src:url(${f.dataUrl}) format('woff2');unicode-range:${f.unicodeRange};}`,
    )
    .join('');
}

let parsed: FontSubset[] | undefined;

/** 텍스트를 그리는 데 필요한 @font-face CSS. 조각을 불러오지 못하면 빈 문자열(대체 글꼴로 그려진다). */
export async function embeddedFontCss(text: string): Promise<string> {
  parsed ??= parseFontSubsets(subsetCss);
  if (Object.keys(subsetLoaders).length === 0) console.warn('[blink] Pretendard subset files not bundled; PNG uses fallback fonts');
  const faces = await Promise.all(
    pickSubsets(parsed, text).map(async (subset) => {
      const load = Object.entries(subsetLoaders).find(([path]) => path.endsWith(`/${subset.file}`))?.[1];
      return load ? { dataUrl: await load(), unicodeRange: subset.unicodeRange } : null;
    }),
  );
  return buildFontFaceCss(
    EXPORT_FONT_FAMILY,
    faces.filter((f): f is { dataUrl: string; unicodeRange: string } => f !== null),
  );
}
