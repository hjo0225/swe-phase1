// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { InfographicSvg } from './InfographicSvg';

describe('InfographicSvg', () => {
  it('draws every node and one connector per edge for a hierarchy', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'hierarchy',
      title: 'Electron 구조',
      nodes: [
        { id: 'r', title: 'Electron', description: '데스크톱 앱 프레임워크' },
        { id: 'm', title: 'Main Process' },
        { id: 'p', title: 'Renderer Process' },
      ],
      edges: [
        ['r', 'm'],
        ['r', 'p'],
      ],
    };
    const { container } = render(<InfographicSvg spec={spec} />);
    const svg = screen.getByRole('img', { name: 'Electron 구조' });
    for (const text of ['Electron', '데스크톱 앱 프레임워크', 'Main Process']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(container.querySelectorAll('path')).toHaveLength(2);
    // PNG 변환을 위해 CSS 클래스·변수 없이 속성으로만 그린다
    expect(container.innerHTML).not.toMatch(/class=|var\(--/);
  });
});
