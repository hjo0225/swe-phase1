// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfographicSvg } from '../renderers/InfographicSvg';
import { layoutInfographic } from '../renderers/layout';
import { prepareSvgForExport } from './svg-to-png';

describe('prepareSvgForExport', () => {
  it('embeds the Pretendard subsets for the drawn text and prefers them, leaving the on-screen SVG untouched', async () => {
    const { container } = render(
      <InfographicSvg
        layout={layoutInfographic({
          version: 1,
          type: 'process',
          title: '처리 과정',
          nodes: [
            { id: '1', title: '작성' },
            { id: '2', title: 'AI 처리' },
          ],
          edges: [['1', '2']],
        })}
      />,
    );
    const onScreen = container.querySelector('svg')!;
    const exported = await prepareSvgForExport(onScreen);

    const style = exported.querySelector('style')!;
    expect(style.textContent).toMatch(/@font-face\{font-family:'Blink Export'.*src:url\(data:font\/woff2;base64,/);
    expect(exported.getAttribute('font-family')).toMatch(/^'Blink Export', 'Pretendard Variable'/);
    expect(onScreen.querySelector('style')).toBeNull();
  });
});
