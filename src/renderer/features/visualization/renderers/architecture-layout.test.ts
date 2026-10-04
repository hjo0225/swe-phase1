import { describe, expect, it } from 'vitest';
import { parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme as t } from '../theme/infographic-theme';
import { cardSize, layoutArchitectureBase, placeArchitecture } from './architecture-layout';

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
  // 첫 테스트가 ELK(약 1.6MB)를 불러온다 — 전체 테스트가 함께 돌면 5초를 넘기기도 한다
  it('puts every node inside its group and every group inside its parent, below the title', { timeout: 20_000 }, async () => {
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

type Box = { x: number; y: number; width: number; height: number };

/** 선 경로의 점들 */
const pointsOf = (path: string) => [...path.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

describe('layoutArchitectureBase — stacked layers', () => {
  // 글 순서와 연결 순서가 다르다: 연결은 ui → core → res
  const layers = parseInfographicSpec({
    version: 1,
    type: 'architecture',
    title: 'Blink — Application Architecture',
    groups: [
      { id: 'res', title: 'Storage & AI Services' },
      { id: 'ui', title: 'User Interface — Renderer' },
      { id: 'core', title: 'Application Core — Main' },
    ],
    nodes: [
      { id: 'md', title: 'Markdown (.md)', icon: 'storage', group: 'res' },
      { id: 'sqlite', title: 'SQLite 3.53', icon: 'database', group: 'res' },
      { id: 'drizzle', title: 'better-sqlite3 / Drizzle', icon: 'database', group: 'res' },
      { id: 'sdk', title: 'OpenAI SDK 7', icon: 'ai', group: 'res' },
      { id: 'kimi', title: 'Kimi', icon: 'ai', group: 'res' },
      { id: 'react', title: 'React 19.3', icon: 'client', group: 'ui' },
      { id: 'tiptap', title: 'Tiptap 3.31', icon: 'client', group: 'ui' },
      { id: 'electron', title: 'Electron 44.4', icon: 'container', group: 'core' },
    ],
    edges: [
      ['core', 'res', { label: 'Connected resources' }],
      ['ui', 'core', { label: 'Preload / IPC' }],
    ],
  });
  const group = (base: { groups: (Box & { id: string })[] }, id: string) => base.groups.find((g) => g.id === id)!;

  it('stacks the layers top to bottom in the order the lines run, centred, below the title', async () => {
    const base = await layoutArchitectureBase(layers);
    const [ui, core, res] = ['ui', 'core', 'res'].map((id) => group(base, id));
    expect(ui!.y).toBe(t.spacing.header);
    expect(core!.y).toBe(ui!.y + ui!.height + a.spacing.betweenLayers);
    expect(res!.y).toBe(core!.y + core!.height + a.spacing.betweenLayers);
    const centre = (g: Box | undefined) => g!.x + g!.width / 2;
    expect(centre(ui)).toBeCloseTo(centre(res));
    expect(centre(core)).toBeCloseTo(centre(res));
    expect(base.groups.every((g) => g.depth === 0)).toBe(true);
    expect(base.width).toBe(Math.max(...base.groups.map((g) => g.x + g.width), ...base.edges.map((e) => e.label!.x + e.label!.width)) + t.spacing.margin);
  });

  it('puts the cards of a layer in one row in the order of the text, four per row, all as tall as the tallest in the row', async () => {
    const base = await layoutArchitectureBase(layers);
    const node = (id: string) => base.nodes.find((n) => n.id === id)!;
    const res = group(base, 'res');
    const row = ['md', 'sqlite', 'drizzle', 'sdk'].map(node);
    expect(row.map((n) => n.y)).toEqual(Array(4).fill(res.y + a.group.header));
    row.slice(1).forEach((n, i) => expect(n.x).toBe(row[i]!.x + a.card.width + a.stack.cardGap));
    expect(row[0]!.x).toBe(res.x + a.group.padding);
    expect(new Set(row.map((n) => n.height)).size).toBe(1);
    expect(row[0]!.height).toBe(cardSize('better-sqlite3 / Drizzle').height);
    expect(row[0]!.height).toBeGreaterThan(cardSize('Markdown (.md)').height);
    // 다섯 번째 카드는 다음 줄, 가운데
    const kimi = node('kimi');
    expect(kimi.y).toBe(row[0]!.y + row[0]!.height + a.stack.cardGap);
    expect(kimi.x + kimi.width / 2).toBeCloseTo(res.x + res.width / 2);
    expect(res.height).toBe(kimi.y + kimi.height + a.group.padding - res.y);
    expect(inside(node('react'), group(base, 'ui'))).toBe(true);
  });

  it('joins neighbouring layers with a straight vertical arrow, its label beside it', async () => {
    const base = await layoutArchitectureBase(layers);
    const ui = group(base, 'ui');
    const core = group(base, 'core');
    const line = base.edges.find((e) => e.from === 'ui')!;
    const points = pointsOf(line.path);
    const x = ui.x + ui.width / 2;
    expect(points).toEqual([
      { x, y: ui.y + ui.height },
      { x, y: core.y },
    ]);
    expect(line.end).toEqual({ x, y: core.y });
    expect(line.arrow).toBe('end');
    expect(line.label).toMatchObject({ text: 'Preload / IPC', x: x + a.stack.labelGap });
    expect(line.label!.y + line.label!.height / 2).toBeCloseTo((ui.y + ui.height + core.y) / 2);
  });

  it('goes around the layers in between when a line skips a layer, and keeps it on the canvas', async () => {
    const skip = parseInfographicSpec({ ...layers, edges: [...layers.edges, ['ui', 'res', { label: 'Drag & drop' }]] });
    const base = await layoutArchitectureBase(skip);
    const ui = group(base, 'ui');
    const core = group(base, 'core');
    const res = group(base, 'res');
    const points = pointsOf(base.edges.find((e) => e.from === 'ui' && e.to === 'res')!.path);
    expect(points[0]).toEqual({ x: ui.x + ui.width, y: ui.y + ui.height / 2 });
    expect(points[points.length - 1]).toEqual({ x: res.x + res.width, y: res.y + res.height / 2 });
    const side = points[1]!.x;
    expect(side).toBeGreaterThan(Math.max(ui.x + ui.width, core.x + core.width, res.x + res.width));
    expect(base.width).toBeGreaterThanOrEqual(side + t.spacing.margin);
  });

  it('keeps two lines between the same layers apart', async () => {
    const both = parseInfographicSpec({ ...layers, edges: [...layers.edges, ['core', 'ui', { label: 'Events' }]] });
    const base = await layoutArchitectureBase(both);
    const down = pointsOf(base.edges.find((e) => e.from === 'ui')!.path);
    const up = pointsOf(base.edges.find((e) => e.from === 'core' && e.to === 'ui')!.path);
    expect(down[0]!.x).not.toBe(up[0]!.x);
    // 아래 층에서 위 층으로 올라가는 선은 아래 층 윗면에서 나온다
    expect(up[0]!.y).toBe(group(base, 'core').y);
    expect(up[1]!.y).toBe(group(base, 'ui').y + group(base, 'ui').height);
  });

  it('redraws the lines of a layer whose box grew around a dragged card, between the two boxes', async () => {
    const base = await layoutArchitectureBase(layers);
    const res = group(base, 'res');
    const moved = placeArchitecture(base, { ...layers, positions: { sdk: { x: res.x + res.width + 100, y: res.y + 60 } } });
    const grown = moved.groups!.find((g) => g.id === 'res')!;
    expect(grown.x + grown.width).toBe(res.x + res.width + 100 + a.card.width + a.group.padding);
    const core = moved.groups!.find((g) => g.id === 'core')!;
    const line = moved.edges.find((e) => e.from === 'core')!;
    expect(pointsOf(line.path)[0]).toEqual({ x: core.x + core.width / 2, y: core.y + core.height });
    expect(line.end).toEqual({ x: grown.x + grown.width / 2, y: grown.y });
    expect(line.label?.text).toBe('Connected resources');
    // 상자가 그대로인 층 사이의 선은 그대로
    expect(moved.edges.find((e) => e.from === 'ui')).toEqual(base.edges.find((e) => e.from === 'ui'));
  });
});

describe('layoutArchitectureBase — lines that end at a group (ELK)', () => {
  it('starts and ends a line on the border of the group box it points at, and redraws it when the box grows', async () => {
    const mixed = parseInfographicSpec({
      version: 1,
      type: 'architecture',
      title: 'Mixed',
      groups: [
        { id: 'app', title: 'Electron app' },
        { id: 'cloud', title: 'Cloud' },
      ],
      nodes: [
        { id: 'u', title: 'Users', icon: 'user' },
        { id: 'ui', title: 'UI', icon: 'client', group: 'app' },
        { id: 'main', title: 'Main', icon: 'server', group: 'app' },
        { id: 'ai', title: 'OpenAI', icon: 'ai', group: 'cloud' },
      ],
      edges: [
        ['u', 'ui'],
        ['ui', 'main'],
        ['app', 'cloud', { label: 'HTTPS' }],
      ],
    });
    const base = await layoutArchitectureBase(mixed);
    const box = (id: string): Box => [...base.nodes, ...base.groups].find((b) => b.id === id)!;
    const near = (p: number, q: number) => Math.abs(p - q) < 1.5;
    const onBorder = (p: { x: number; y: number }, c: Box) =>
      (near(p.x, c.x) || near(p.x, c.x + c.width) || near(p.y, c.y) || near(p.y, c.y + c.height)) &&
      p.x >= c.x - 1.5 &&
      p.x <= c.x + c.width + 1.5 &&
      p.y >= c.y - 1.5 &&
      p.y <= c.y + c.height + 1.5;
    const line = base.edges.find((e) => e.from === 'app')!;
    expect(onBorder(pointsOf(line.path)[0]!, box('app'))).toBe(true);
    expect(onBorder(line.end, box('cloud'))).toBe(true);
    expect(line.label?.text).toBe('HTTPS');
    // 카드를 옮겨 Electron app 상자가 커지면 그 상자에 닿는 선도 다시 잇는다
    const main = box('main');
    const moved = placeArchitecture(base, { ...mixed, positions: { main: { x: main.x, y: main.y + 260 } } });
    const app = moved.groups!.find((g) => g.id === 'app')!;
    expect(app.height).toBeGreaterThan(box('app').height);
    const redrawn = moved.edges.find((e) => e.from === 'app')!;
    expect(redrawn).not.toEqual(line);
    expect(onBorder(pointsOf(redrawn.path)[0]!, app)).toBe(true);
    expect(onBorder(redrawn.end, moved.groups!.find((g) => g.id === 'cloud')!)).toBe(true);
  });
});
