import { describe, expect, it } from 'vitest';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutInfographic, wrapText } from './layout';

const process = (count: number): InfographicSpec => ({
  version: 1,
  type: 'process',
  title: '과정',
  nodes: Array.from({ length: count }, (_, i) => ({ id: String(i + 1), title: `단계 ${i + 1}`, description: '설명' })),
  edges: Array.from({ length: count - 1 }, (_, i) => [String(i + 1), String(i + 2)] as [string, string]),
});

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('wrapText', () => {
  it('breaks on spaces within the budget and hard-breaks long words', () => {
    expect(wrapText('Main Process와 Renderer Process', 14)).toEqual(['Main Process와', 'Renderer', 'Process']);
    expect(wrapText('가'.repeat(30), 12)).toEqual(['가'.repeat(12), '가'.repeat(12), '가'.repeat(6)]);
    expect(wrapText('', 10)).toEqual([]);
  });
});

describe('layoutInfographic — process', () => {
  it('places up to four steps left to right on one row and marks the start', () => {
    const layout = layoutInfographic(process(3));
    const [a, b, c] = layout.nodes;
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(1);
    expect(layout.nodes.map((n) => n.emphasis)).toEqual([true, false, false]);
    expect(layout.edges).toHaveLength(2);
  });

  it('wraps longer processes onto more rows without overlapping cards', () => {
    const layout = layoutInfographic(process(6));
    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(2);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect(overlaps(layout.nodes[i]!, layout.nodes[j]!)).toBe(false);
      }
    }
  });

  it('fits every card inside the canvas', () => {
    const layout = layoutInfographic(process(6));
    for (const n of layout.nodes) {
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe('layoutInfographic — hierarchy', () => {
  const spec: InfographicSpec = {
    version: 1,
    type: 'hierarchy',
    title: '구성',
    nodes: [
      { id: 'r', title: 'Electron' },
      { id: 'm', title: 'Main' },
      { id: 'p', title: 'Renderer' },
      { id: 'x', title: 'Preload' },
    ],
    edges: [
      ['r', 'm'],
      ['r', 'p'],
      ['m', 'x'],
    ],
  };

  it('puts children one level below their parent and centers the root over its children', () => {
    const layout = layoutInfographic(spec);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const [root, main, renderer, preload] = ['r', 'm', 'p', 'x'].map((id) => byId.get(id)!);
    expect(main!.y).toBeGreaterThan(root!.y);
    expect(renderer!.y).toBe(main!.y);
    expect(preload!.y).toBeGreaterThan(main!.y);
    const center = (n: typeof root) => n!.x + n!.width / 2;
    expect(center(root)).toBeCloseTo((center(main) + center(renderer)) / 2);
    expect(root!.emphasis).toBe(true);
    expect(overlaps(main!, renderer!)).toBe(false);
  });
});
