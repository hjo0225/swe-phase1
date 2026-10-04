// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseInfographicSpec, type InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutArchitectureBase, placeArchitecture } from './architecture-layout';
import { InfographicSvg } from './InfographicSvg';
import { layoutInfographic } from './layout';

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
    const { container } = render(<InfographicSvg layout={layoutInfographic(spec)} />);
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
    const { container } = render(<InfographicSvg layout={layoutInfographic(spec)} />);
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
    const { container } = render(<InfographicSvg layout={layoutInfographic(spec)} />);
    expect(container.querySelectorAll('path')).toHaveLength(3);
    expect(container.querySelectorAll('[data-panel]')).toHaveLength(0);
  });

  it('draws architecture groups, icon cards, arrows on both ends and line labels', async () => {
    const spec = parseInfographicSpec({
      version: 1,
      type: 'architecture',
      title: 'Web service',
      groups: [{ id: 'vpc', title: 'VPC A' }],
      nodes: [
        { id: 'u', title: 'Users', icon: 'user' },
        { id: 'w', title: 'Web', icon: 'server', group: 'vpc' },
        { id: 'd', title: 'DB', icon: 'database', group: 'vpc' },
      ],
      edges: [
        ['u', 'w', { label: 'HTTPS' }],
        ['w', 'd', { bidirectional: true }],
      ],
    });
    const layout = placeArchitecture(await layoutArchitectureBase(spec), spec);
    const { container } = render(<InfographicSvg layout={layout} />);
    expect(screen.getByRole('img', { name: 'Web service' })).toBeInTheDocument();
    expect(screen.getByText('VPC A')).toBeInTheDocument();
    expect(screen.getByText('HTTPS')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-group]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-card] svg')).toHaveLength(3); // 카드마다 아이콘
    const lines = container.querySelectorAll('path[data-edge]');
    expect(lines[0]!.getAttribute('marker-end')).toMatch(/^url\(#arrow-/);
    expect(lines[0]!.getAttribute('marker-start')).toBeNull();
    expect(lines[1]!.getAttribute('marker-start')).toMatch(/^url\(#arrow-/);
    // 화살표가 있으면 끝점의 점은 그리지 않는다
    expect(container.querySelectorAll('svg[role="img"] > g > circle')).toHaveLength(0);
    // 아이콘(lucide)까지 CSS 클래스·변수 없이 속성으로만 그린다 (PNG 변환)
    expect(container.innerHTML).not.toMatch(/class=|var\(--/);
  });

  it('draws the outermost group dashed and inner groups filled', async () => {
    const spec = parseInfographicSpec({
      version: 1,
      type: 'architecture',
      title: 'Zones',
      groups: [
        { id: 'vpc', title: 'VPC A' },
        { id: 'za', title: 'Zone A', parent: 'vpc' },
      ],
      nodes: [
        { id: 'lb', title: 'LB', icon: 'load-balancer', group: 'vpc' },
        { id: 'w', title: 'Web', group: 'za' },
      ],
      edges: [['lb', 'w']],
    });
    const layout = placeArchitecture(await layoutArchitectureBase(spec), spec);
    const { container } = render(<InfographicSvg layout={layout} />);
    const box = (id: string) => container.querySelector(`[data-group="${id}"] rect`)!;
    expect(box('vpc').getAttribute('stroke-dasharray')).toBeTruthy();
    expect(box('vpc').getAttribute('fill')).toBe('none');
    expect(box('za').getAttribute('stroke-dasharray')).toBeNull();
    expect(box('za').getAttribute('fill')).not.toBe('none');
    // 아이콘이 없는 노드도 기본 상자 아이콘을 그린다
    expect(container.querySelector('[data-card="w"] svg')).not.toBeNull();
  });

  it('keeps drawing the existing types with an end dot and no arrow marker', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'process',
      title: '과정',
      nodes: [
        { id: '1', title: '입력' },
        { id: '2', title: '결과' },
      ],
      edges: [['1', '2']],
    };
    const { container } = render(<InfographicSvg layout={layoutInfographic(spec)} />);
    expect(container.querySelectorAll('svg[role="img"] > g > circle')).toHaveLength(1);
    expect(container.querySelector('marker')).toBeNull();
    expect(container.querySelector('[data-card] svg')).toBeNull();
  });
});
