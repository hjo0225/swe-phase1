import { describe, expect, it } from 'vitest';
import { parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme as t } from '../theme/infographic-theme';
import { layoutArchitectureBase } from './architecture-layout';

const spec = parseInfographicSpec({
  version: 1,
  type: 'architecture',
  title: 'Multi zone',
  groups: [
    { id: 'vpc', title: 'VPC A' },
    { id: 'za', title: 'Zone A', parent: 'vpc' },
  ],
  nodes: [
    { id: 'u', title: 'Users', icon: 'user' },
    { id: 'lb', title: 'Load Balancer', icon: 'load-balancer', group: 'vpc' },
    { id: 'w', title: 'Web', icon: 'server', group: 'za' },
    { id: 'db', title: 'DB', icon: 'database', group: 'za' },
  ],
  edges: [
    ['u', 'lb', { label: 'HTTPS' }],
    ['lb', 'w'],
    ['w', 'db', { bidirectional: true }],
  ],
});

const inside = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe('layoutArchitectureBase', () => {
  it('puts every node inside its group and every group inside its parent, below the title', async () => {
    const base = await layoutArchitectureBase(spec);
    const node = (id: string) => base.nodes.find((n) => n.id === id)!;
    const group = (id: string) => base.groups.find((g) => g.id === id)!;
    expect(inside(node('lb'), group('vpc'))).toBe(true);
    expect(inside(node('w'), group('za'))).toBe(true);
    expect(inside(group('za'), group('vpc'))).toBe(true);
    expect(inside(node('u'), group('vpc'))).toBe(false);
    expect(Math.min(...base.nodes.map((n) => n.y), ...base.groups.map((g) => g.y))).toBeGreaterThanOrEqual(t.spacing.header);
    expect(base.groups.map((g) => [g.id, g.depth])).toEqual([
      ['vpc', 0],
      ['za', 1],
    ]);
    expect(node('db').icon).toBe('database');
  });

  it('starts and ends each line on the border of its two cards, in absolute coordinates', async () => {
    const base = await layoutArchitectureBase(spec);
    const node = (id: string) => base.nodes.find((n) => n.id === id)!;
    for (const edge of base.edges) {
      const [x1, y1] = edge.path.split(' ').slice(1, 3).map(Number);
      const a = node(edge.from);
      const b = node(edge.to);
      const onBorder = (p: { x: number; y: number }, c: typeof a) =>
        p.x >= c.x - 1 && p.x <= c.x + c.width + 1 && p.y >= c.y - 1 && p.y <= c.y + c.height + 1;
      expect(onBorder({ x: x1!, y: y1! }, a)).toBe(true);
      expect(onBorder(edge.end, b)).toBe(true);
    }
  });

  it('keeps arrow directions and places line labels', async () => {
    const base = await layoutArchitectureBase(spec);
    const edge = (from: string) => base.edges.find((e) => e.from === from)!;
    expect(edge('u').arrow).toBe('end');
    expect(edge('w').arrow).toBe('both');
    expect(edge('u').label).toMatchObject({ text: 'HTTPS' });
    expect(edge('lb').label).toBeUndefined();
    expect(edge('u').path).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/); // 직각 꺾은선
  });

  it('fits the canvas around everything with a margin', async () => {
    const base = await layoutArchitectureBase(spec);
    const right = Math.max(...[...base.nodes, ...base.groups].map((b) => b.x + b.width));
    const bottom = Math.max(...[...base.nodes, ...base.groups].map((b) => b.y + b.height));
    expect(base.width).toBeGreaterThanOrEqual(right + t.spacing.margin);
    expect(base.height).toBe(bottom + t.spacing.margin);
  });
});
