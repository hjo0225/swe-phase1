import { describe, expect, it } from 'vitest';
import { buildFontFaceCss, parseFontSubsets, pickSubsets } from './embed-fonts';

const css = `
/* [0] */
@font-face {
	font-family: 'Pretendard Variable';
	font-weight: 45 920;
	src: url(./woff2-dynamic-subset/PretendardVariable.subset.0.woff2) format('woff2-variations');
	unicode-range: U+ac00-ac0f, U+b098;
}
/* [1] */
@font-face {
	font-family: 'Pretendard Variable';
	font-weight: 45 920;
	src: url(./woff2-dynamic-subset/PretendardVariable.subset.1.woff2) format('woff2-variations');
	unicode-range: U+0041-005a, U+0061-007a, U+0020;
}
/* [2] */
@font-face {
	font-family: 'Pretendard Variable';
	font-weight: 45 920;
	src: url(./woff2-dynamic-subset/PretendardVariable.subset.2.woff2) format('woff2-variations');
	unicode-range: U+c9c0-c9cf;
}`;

describe('parseFontSubsets', () => {
  it('reads each subset file with its unicode ranges', () => {
    expect(parseFontSubsets(css)).toEqual([
      { file: 'PretendardVariable.subset.0.woff2', unicodeRange: 'U+ac00-ac0f, U+b098', ranges: [[0xac00, 0xac0f], [0xb098, 0xb098]] },
      {
        file: 'PretendardVariable.subset.1.woff2',
        unicodeRange: 'U+0041-005a, U+0061-007a, U+0020',
        ranges: [[0x41, 0x5a], [0x61, 0x7a], [0x20, 0x20]],
      },
      { file: 'PretendardVariable.subset.2.woff2', unicodeRange: 'U+c9c0-c9cf', ranges: [[0xc9c0, 0xc9cf]] },
    ]);
  });

  it('finds the real Pretendard subsets shipped with the app', async () => {
    const { default: shipped } = await import('pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css?raw');
    expect(parseFontSubsets(shipped)).toHaveLength(92);
  });
});

describe('pickSubsets', () => {
  it('picks only the subsets covering the characters that are drawn', () => {
    const subsets = parseFontSubsets(css);
    expect(pickSubsets(subsets, 'AI 가').map((s) => s.file)).toEqual([
      'PretendardVariable.subset.1.woff2',
      'PretendardVariable.subset.0.woff2',
    ]);
    expect(pickSubsets(subsets, '').map((s) => s.file)).toEqual([]);
  });
});

describe('buildFontFaceCss', () => {
  it('declares an embedded variable font face per subset', () => {
    const face = buildFontFaceCss('Blink Export', [{ dataUrl: 'data:font/woff2;base64,AAA', unicodeRange: 'U+0041-005a' }]);
    expect(face).toBe(
      "@font-face{font-family:'Blink Export';font-weight:45 920;src:url(data:font/woff2;base64,AAA) format('woff2');unicode-range:U+0041-005a;}",
    );
  });
});

describe('embeddedFontCss', () => {
  it('inlines the real subset files for the drawn text as base64 woff2', async () => {
    const { embeddedFontCss } = await import('./embed-fonts');
    const face = await embeddedFontCss('처리 과정');
    expect(face.match(/@font-face/g)?.length).toBeGreaterThanOrEqual(1);
    expect(face).toContain("font-family:'Blink Export'");
    expect(face).toMatch(/src:url\(data:font\/woff2;base64,[A-Za-z0-9+/]{100,}/);
  });
});
