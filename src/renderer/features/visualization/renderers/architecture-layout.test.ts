import { describe, expect, it } from 'vitest';
import { parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme as t } from '../theme/infographic-theme';
import { layoutArchitectureBase, placeArchitecture } from './architecture-layout';

const a = t.architecture;

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

describe('placeArchitecture', () => {
  it('returns the ELK layout unchanged when nothing was moved', async () => {
    const base = await layoutArchitectureBase(spec);
    const layout = placeArchitecture(base, spec);
    expect(layout).toMatchObject({ nodes: base.nodes, groups: base.groups, edges: base.edges, width: base.width, height: base.height, panels: [] });
  });

  it('moves the card, redraws only its lines as right-angled paths and keeps the label on the line', async () => {
    const base = await layoutArchitectureBase(spec);
    const lb = base.nodes.find((n) => n.id === 'lb')!;
    const moved = placeArchitecture(base, { ...spec, positions: { u: { x: lb.x - 260, y: lb.y + 200 } } });
    const u = moved.nodes.find((n) => n.id === 'u')!;
    expect([u.x, u.y]).toEqual([lb.x - 260, lb.y + 200]);
    const line = moved.edges.find((e) => e.from === 'u')!;
    expect(line.path).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
    expect(line.end.x).toBe(lb.x); // 오른쪽에 있는 로드밸런서의 왼쪽 면으로 들어간다
    expect(line.arrow).toBe('end');
    expect(line.label?.text).toBe('HTTPS');
    // 라벨은 가운데 세로 선분의 가운데에 놓인다
    const [, x1, y1, , mx] = line.path.split(' ').map(Number);
    expect([x1, y1]).toEqual([u.x + u.width, u.y + u.height / 2]); // 사용자 카드 오른쪽 면에서 나온다
    expect(line.label!.x + line.label!.width / 2).toBeCloseTo(mx!);
    expect(line.label!.y + line.label!.height / 2).toBeCloseTo((u.y + u.height / 2 + lb.y + lb.height / 2) / 2);
    // 옮기지 않은 카드끼리의 선과 옮긴 카드를 품지 않은 그룹은 ELK 결과 그대로
    expect(moved.edges.find((e) => e.from === 'lb')).toEqual(base.edges.find((e) => e.from === 'lb'));
    expect(moved.edges.find((e) => e.from === 'w')).toEqual(base.edges.find((e) => e.from === 'w'));
    expect(moved.groups).toEqual(base.groups);
  });

  it('goes through the top and bottom sides when the cards overlap horizontally', async () => {
    const base = await layoutArchitectureBase(spec);
    const lb = base.nodes.find((n) => n.id === 'lb')!;
    const moved = placeArchitecture(base, { ...spec, positions: { u: { x: lb.x + 30, y: lb.y + lb.height + 150 } } });
    const u = moved.nodes.find((n) => n.id === 'u')!;
    const line = moved.edges.find((e) => e.from === 'u')!;
    const [, x1, y1] = line.path.split(' ').map(Number);
    expect([x1, y1]).toEqual([u.x + u.width / 2, u.y]); // 아래의 사용자 카드 윗면에서 나와
    expect(line.end).toEqual({ x: lb.x + lb.width / 2, y: lb.y + lb.height }); // 로드밸런서 아랫면으로 들어간다
    expect(line.path.split(' L ')).toHaveLength(4);
  });

  it('resizes the groups around a card dragged out of them, all the way up', async () => {
    const base = await layoutArchitectureBase(spec);
    const vpc = base.groups.find((g) => g.id === 'vpc')!;
    const moved = placeArchitecture(base, { ...spec, positions: { db: { x: vpc.x + vpc.width + 120, y: vpc.y + vpc.height + 80 } } });
    const db = moved.nodes.find((n) => n.id === 'db')!;
    const za = moved.groups!.find((g) => g.id === 'za')!;
    const outer = moved.groups!.find((g) => g.id === 'vpc')!;
    expect(za.x + za.width).toBe(db.x + db.width + a.group.padding);
    expect(za.y + za.height).toBe(db.y + db.height + a.group.padding);
    expect(outer.x + outer.width).toBe(za.x + za.width + a.group.padding);
    expect(moved.width).toBe(outer.x + outer.width + t.spacing.margin);
    expect(moved.height).toBe(outer.y + outer.height + t.spacing.margin);
    // 그룹 이름 자리와 depth는 그대로
    const w = moved.nodes.find((n) => n.id === 'w')!;
    expect(za.y).toBe(w.y - a.group.header);
    expect(outer.y).toBe(za.y - a.group.header);
    expect(moved.groups!.map((g) => [g.id, g.depth])).toEqual([
      ['vpc', 0],
      ['za', 1],
    ]);
  });

  it('keeps a moved card and the groups around it out of the title area and the left margin', async () => {
    const base = await layoutArchitectureBase(spec);
    const outside = placeArchitecture(base, { ...spec, positions: { u: { x: -50, y: 0 } } });
    expect(outside.nodes.find((n) => n.id === 'u')).toMatchObject({ x: t.spacing.margin, y: t.spacing.header });

    const nested = placeArchitecture(base, { ...spec, positions: { w: { x: -50, y: 0 } } });
    // w는 VPC › Zone 안에 있으니 두 그룹의 이름 자리·여백만큼 더 안쪽에서 멈춘다
    expect(nested.nodes.find((n) => n.id === 'w')).toMatchObject({
      x: t.spacing.margin + a.group.padding * 2,
      y: t.spacing.header + a.group.header * 2,
    });
    const vpc = nested.groups!.find((g) => g.id === 'vpc')!;
    expect(vpc.x).toBe(t.spacing.margin);
    expect(vpc.y).toBe(t.spacing.header);
  });

  it('keeps a redrawn line label inside the canvas', async () => {
    const pair = parseInfographicSpec({
      version: 1,
      type: 'architecture',
      title: 'Pair',
      nodes: [
        { id: 'app', title: 'App', icon: 'server' },
        { id: 'store', title: 'Store', icon: 'database' },
      ],
      edges: [['app', 'store', { label: 'Long protocol label here' }]],
    });
    const base = await layoutArchitectureBase(pair);
    const app = base.nodes.find((n) => n.id === 'app')!;
    // 저장소를 앱 바로 아래로 옮기면 카드보다 넓은 라벨이 가운데 가로 선분 위에 놓여 카드 오른쪽으로 삐져나온다
    const moved = placeArchitecture(base, { ...pair, positions: { store: { x: app.x, y: app.y + 300 } } });
    const label = moved.edges[0]!.label!;
    expect(label.width).toBeGreaterThan(app.width);
    expect(label.x + label.width + t.spacing.margin).toBeLessThanOrEqual(moved.width);
    expect(label.y + label.height + t.spacing.margin).toBeLessThanOrEqual(moved.height);
  });
});
