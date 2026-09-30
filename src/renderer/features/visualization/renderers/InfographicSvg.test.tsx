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

  it('draws a comparison as column panels without connectors', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'comparison',
      title: '비교',
      nodes: [
        { id: 'a', title: 'SQLite' },
        { id: 'b', title: 'Markdown' },
        { id: 'a1', title: '빠른 검색' },
        { id: 'b1', title: '다른 앱과 호환' },
      ],
      edges: [
        ['a', 'a1'],
        ['b', 'b1'],
      ],
    };
    const { container } = render(<InfographicSvg spec={spec} />);
    expect(container.querySelectorAll('[data-panel]')).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(0);
    expect(screen.getByText('다른 앱과 호환')).toBeInTheDocument();
  });

  it('draws a mindmap with one connector per branch', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'mindmap',
      title: '마인드맵',
      nodes: [
        { id: 'c', title: '중심' },
        { id: 't1', title: '주제 1' },
        { id: 't2', title: '주제 2' },
        { id: 'd1', title: '세부' },
      ],
      edges: [
        ['c', 't1'],
        ['c', 't2'],
        ['t1', 'd1'],
      ],
    };
    const { container } = render(<InfographicSvg spec={spec} />);
    expect(container.querySelectorAll('path')).toHaveLength(3);
    expect(container.querySelectorAll('[data-panel]')).toHaveLength(0);
  });
});
