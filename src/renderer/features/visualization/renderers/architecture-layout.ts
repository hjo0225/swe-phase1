import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api';
import { isLayerStack, type InfographicGroup, type InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme } from '../theme/infographic-theme';
import { widthOf, wrapText, type EdgeLabel, type InfographicLayout, type LayoutEdge, type LayoutGroup, type LayoutNode } from './layout';

const t = infographicTheme;
const a = infographicTheme.architecture;

export interface ArchitectureBase {
  title: string;
  width: number;
  height: number;
  nodes: LayoutNode[];
  groups: LayoutGroup[];
  edges: LayoutEdge[];
}

const ROOT = '__root';

let elk: Promise<ELK> | null = null;
/** ELK(약 1.6MB)는 architecture 블록이 처음 그려질 때 불러온다. eval을 쓰지 않는 bundled 판이라 CSP(script-src 'self')에 맞는다. */
const loadElk = (): Promise<ELK> =>
  (elk ??= import('elkjs/lib/elk.bundled.js').then(
    (m) => new m.default(),
    (error: unknown) => {
      elk = null; // 불러오기에 실패하면 다음에 다시 시도한다
      throw error;
    },
  ));

/** 아이콘 카드 크기: 아이콘 위, 제목 아래 */
export function cardSize(title: string): { titleLines: string[]; height: number } {
  const titleLines = wrapText(title, a.title.maxWidth);
  return { titleLines, height: a.card.padding * 2 + a.card.iconSize + a.card.iconGap + titleLines.length * a.title.lineHeight };
}

/** 그룹 상자 안쪽 여백 — 위쪽은 그룹 이름 자리 */
const padding = `[top=${a.group.header},left=${a.group.padding},bottom=${a.group.padding},right=${a.group.padding}]`;

/**
 * Spec → 절대 좌표. 층 구조(모든 선이 맨 바깥 그룹 사이에만 있다)는 층을 위→아래로 쌓고(stackLayers, ELK를 불러오지 않는다),
 * 그 밖에는 ELK 그래프로 배치한다(그룹 끝 선도 ELK가 잇는다). 제목 영역(t.spacing.header)과 여백(t.spacing.margin)만큼 옮겨 둔다.
 */
export async function layoutArchitectureBase(spec: InfographicSpec): Promise<ArchitectureBase> {
  return isLayerStack(spec) ? stackLayers(spec) : layoutWithElk(spec);
}

async function layoutWithElk(spec: InfographicSpec): Promise<ArchitectureBase> {
  const groups = spec.groups ?? [];
  const sizes = new Map(spec.nodes.map((n) => [n.id, cardSize(n.title)]));
  const elkNodeOf = (id: string): ElkNode => ({ id, width: a.card.width, height: sizes.get(id)!.height });
  // 그룹은 ELK의 자식 노드로 중첩한다. 그룹 먼저, 그 다음 그룹에 바로 든 카드
  const childrenOf = (parent: string | undefined): ElkNode[] => [
    ...groups
      .filter((g) => g.parent === parent)
      .map((g): ElkNode => ({ id: g.id, layoutOptions: { 'elk.padding': padding }, children: childrenOf(g.id) })),
    ...spec.nodes.filter((n) => n.group === parent).map((n) => elkNodeOf(n.id)),
  ];
  // 선은 모두 루트에 둔다 (INCLUDE_CHILDREN이 그룹을 넘나드는 선을 함께 배치한다)
  const edges: ElkExtendedEdge[] = spec.edges.map(([from, to, meta], i) => ({
    id: `e${i}`,
    sources: [from],
    targets: [to],
    labels: meta?.label
      ? [{ text: meta.label, width: widthOf(meta.label) * a.label.size + a.label.paddingX * 2, height: a.label.height }]
      : [],
  }));
  const root = await (await loadElk()).layout({
    id: ROOT,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': String(a.spacing.nodeNode),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(a.spacing.betweenLayers),
      'elk.edgeLabels.placement': 'CENTER',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: childrenOf(undefined),
    edges,
  });

  // ELK 좌표: 노드·그룹은 부모 기준, 연결선·라벨은 그 선의 container 기준 → 절대 좌표로
  const abs = new Map<string, { x: number; y: number; width: number; height: number; depth: number }>();
  const walk = (n: ElkNode, ox: number, oy: number, depth: number) => {
    const x = ox + (n.x ?? 0);
    const y = oy + (n.y ?? 0);
    abs.set(n.id, { x, y, width: n.width ?? 0, height: n.height ?? 0, depth });
    for (const child of n.children ?? []) walk(child, x, y, depth + 1);
  };
  // 루트가 -1이라 맨 바깥 그룹이 0이 된다 (노드의 depth는 쓰지 않는다)
  walk(root, t.spacing.margin, t.spacing.header, -1);

  const nodes: LayoutNode[] = spec.nodes.map((n) => {
    const box = abs.get(n.id)!;
    return {
      id: n.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      titleLines: sizes.get(n.id)!.titleLines,
      descriptionLines: [],
      emphasis: false,
      icon: n.icon ?? 'generic',
    };
  });
  const layoutGroups: LayoutGroup[] = groups.map((g) => {
    const box = abs.get(g.id)!;
    return { id: g.id, title: g.title, x: box.x, y: box.y, width: box.width, height: box.height, depth: box.depth };
  });

  const layoutEdges: LayoutEdge[] = (root.edges ?? []).map((e) => {
    const [from, to, meta] = spec.edges[Number(e.id.slice(1))]!;
    const origin = abs.get(e.container ?? ROOT)!;
    let points = edgePoints(e).map((p) => ({ x: origin.x + p.x, y: origin.y + p.y }));
    if (points.length < 2) {
      // 경로가 없으면(드문 경우) 두 카드의 오른쪽·왼쪽 가운데를 곧게 잇는다
      const s = abs.get(from)!;
      const d = abs.get(to)!;
      points = [
        { x: s.x + s.width, y: s.y + s.height / 2 },
        { x: d.x, y: d.y + d.height / 2 },
      ];
    }
    const raw = e.labels?.[0];
    const label: EdgeLabel | undefined =
      meta?.label && raw
        ? { text: meta.label, x: origin.x + (raw.x ?? 0), y: origin.y + (raw.y ?? 0), width: raw.width ?? 0, height: raw.height ?? 0 }
        : undefined;
    return {
      from,
      to,
      path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
      end: points[points.length - 1]!,
      arrow: meta?.bidirectional ? 'both' : 'end',
      ...(label ? { label } : {}),
    };
  });

  return { title: spec.title, nodes, groups: layoutGroups, edges: layoutEdges, ...canvasSize(spec.title, nodes, layoutGroups, layoutEdges) };
}

/** 캔버스는 카드·그룹·선(꺾인 점)·선 라벨을 모두 여백을 두고 품고, 제목이 들어갈 만큼은 넓다 */
function canvasSize(title: string, nodes: LayoutNode[], groups: LayoutGroup[], edges: LayoutEdge[]): { width: number; height: number } {
  const boxes: Box[] = [
    ...nodes,
    ...groups,
    ...edges.flatMap((e) => (e.label ? [e.label] : [])),
    ...edges.flatMap((e) => pathPoints(e.path).map((p) => ({ ...p, width: 0, height: 0 }))),
  ];
  const titleWidth = t.spacing.margin * 2 + widthOf(title) * t.title.size;
  return {
    width: Math.max(titleWidth, ...boxes.map((b) => b.x + b.width + t.spacing.margin)),
    height: Math.max(...boxes.map((b) => b.y + b.height + t.spacing.margin)),
  };
}

/**
 * ELK 기본 배치 위에 옮긴 카드(spec.positions)를 덮어쓴다.
 * 옮긴 카드에 닿는 선만 직각으로 다시 잇고, 옮긴 카드를 (하위 그룹 포함) 품은 그룹만 내용에 맞게 다시 잡는다.
 * 옮긴 것이 없으면 ELK 결과를 그대로 쓴다.
 */
export function placeArchitecture(base: ArchitectureBase, spec: InfographicSpec): InfographicLayout {
  const positions = spec.positions ?? {};
  const movedIds = new Set(Object.keys(positions).filter((id) => base.nodes.some((n) => n.id === id)));
  if (movedIds.size === 0) return { ...base, panels: [] };

  const parentOf = new Map((spec.groups ?? []).map((g) => [g.id, g.parent]));
  const groupOfNode = new Map(spec.nodes.map((n) => [n.id, n.group]));
  /** 카드를 품은 그룹들 (안쪽부터) */
  const ancestorsOf = (id: string): string[] => {
    const chain: string[] = [];
    for (let g = groupOfNode.get(id); g; g = parentOf.get(g)) chain.push(g);
    return chain;
  };

  // 다른 유형과 같이 제목 영역·왼쪽 여백 밖으로는 못 나간다. 그룹 안 카드는 품은 그룹의 이름 자리·여백까지 비켜야
  // 다시 맞춘 그룹 상자도 제목 영역을 덮지 않는다.
  const nodes = base.nodes.map((n) => {
    if (!movedIds.has(n.id)) return n;
    const depth = ancestorsOf(n.id).length;
    return {
      ...n,
      x: Math.max(t.spacing.margin + depth * a.group.padding, positions[n.id]!.x),
      y: Math.max(t.spacing.header + depth * a.group.header, positions[n.id]!.y),
    };
  });
  const touched = new Set([...movedIds].flatMap(ancestorsOf));
  // 깊은 그룹부터 다시 잡아야 바깥 그룹이 새로 잡은 안쪽 상자를 감싼다
  const groups = [...base.groups];
  for (const group of [...base.groups].sort((p, q) => q.depth - p.depth)) {
    if (!touched.has(group.id)) continue;
    const members = [
      ...nodes.filter((n) => groupOfNode.get(n.id) === group.id),
      ...groups.filter((g) => parentOf.get(g.id) === group.id),
    ];
    const left = Math.min(...members.map((m) => m.x)) - a.group.padding;
    const top = Math.min(...members.map((m) => m.y)) - a.group.header;
    const right = Math.max(...members.map((m) => m.x + m.width)) + a.group.padding;
    const bottom = Math.max(...members.map((m) => m.y + m.height)) + a.group.padding;
    groups[groups.findIndex((g) => g.id === group.id)] = { ...group, x: left, y: top, width: right - left, height: bottom - top };
  }

  // 옮긴 카드에 닿는 선, 그리고 다시 맞추어 상자가 달라진 그룹에 닿는 선을 다시 잇는다
  const changed = new Set(groups.filter((g, i) => !sameBox(g, base.groups[i]!)).map((g) => g.id));
  const boxOf = new Map<string, Box>([...nodes, ...groups].map((b) => [b.id, b]));
  const redraw = (id: string) => movedIds.has(id) || changed.has(id);
  const edges = base.edges.map((e) => (redraw(e.from) || redraw(e.to) ? elbow(boxOf.get(e.from)!, boxOf.get(e.to)!, e) : e));

  return { title: base.title, nodes, groups, edges, panels: [], ...canvasSize(spec.title, nodes, groups, edges) };
}

const overlapX = (p: Box, q: Box) => p.x < q.x + q.width && q.x < p.x + p.width;

/**
 * 두 상자(카드 또는 그룹)의 마주 보는 면을 잇는 직각 꺾은선. 가로로 떨어져 있으면 옆면 → 가운데 세로 선분 → 옆면,
 * 가로로 겹치면 윗면·아랫면 → 가운데 가로 선분. 화살표·라벨은 그대로 두고 라벨은 가운데 선분의 가운데에 놓는다.
 */
function elbow(p: Box, q: Box, edge: LayoutEdge): LayoutEdge {
  let corners: { x: number; y: number }[];
  if (!overlapX(p, q)) {
    const toRight = q.x >= p.x + p.width;
    const x1 = toRight ? p.x + p.width : p.x;
    const x2 = toRight ? q.x : q.x + q.width;
    const [y1, y2] = [p.y + p.height / 2, q.y + q.height / 2];
    const mx = (x1 + x2) / 2;
    corners = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }];
  } else {
    const down = q.y >= p.y;
    const [x1, x2] = [p.x + p.width / 2, q.x + q.width / 2];
    const y1 = down ? p.y + p.height : p.y;
    const y2 = down ? q.y : q.y + q.height;
    const my = (y1 + y2) / 2;
    corners = [{ x: x1, y: y1 }, { x: x1, y: my }, { x: x2, y: my }, { x: x2, y: y2 }];
  }
  const mid = { x: (corners[1]!.x + corners[2]!.x) / 2, y: (corners[1]!.y + corners[2]!.y) / 2 };
  // 두 카드가 나란하면 가운데 선분 길이가 0 — 같은 점을 빼야 화살표 방향이 흐트러지지 않는다
  const points = corners.filter((pt, i) => i === 0 || pt.x !== corners[i - 1]!.x || pt.y !== corners[i - 1]!.y);
  return {
    ...edge,
    path: points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' '),
    end: points[points.length - 1]!,
    ...(edge.label ? { label: { ...edge.label, x: mid.x - edge.label.width / 2, y: mid.y - edge.label.height / 2 } } : {}),
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const sameBox = (p: Box, q: Box) => p.x === q.x && p.y === q.y && p.width === q.width && p.height === q.height;

const pathOf = (points: readonly { x: number; y: number }[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

/** SVG path d("M x y L x y …")의 점들 */
function pathPoints(path: string): { x: number; y: number }[] {
  return [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

const labelSize = (text: string) => ({ width: widthOf(text) * a.label.size + a.label.paddingX * 2, height: a.label.height });

/** 그룹 이름이 들어갈 폭 (이름은 상자 왼쪽에서 14 안쪽에 쓴다) */
const groupTitleWidth = (title: string) => widthOf(title) * a.group.label.size + 28;

/** 층 순서: 선이 가는 순서(위상 정렬), 동률이면 글 순서. 선이 돌고 돌면 남은 것 중 글 순서가 앞선 층부터 */
function layerOrder(spec: InfographicSpec): InfographicGroup[] {
  const groups = spec.groups ?? [];
  const incoming = new Map(groups.map((g) => [g.id, 0]));
  for (const [, to] of spec.edges) incoming.set(to, (incoming.get(to) ?? 0) + 1);
  const placed = new Set<string>();
  const order: InfographicGroup[] = [];
  while (order.length < groups.length) {
    const next = groups.find((g) => !placed.has(g.id) && incoming.get(g.id) === 0) ?? groups.find((g) => !placed.has(g.id))!;
    placed.add(next.id);
    order.push(next);
    for (const [from, to] of spec.edges) if (from === next.id && !placed.has(to)) incoming.set(to, incoming.get(to)! - 1);
  }
  return order;
}

/**
 * 층 쌓기 배치 (ELK를 쓰지 않는다): 층(맨 바깥 그룹)을 선 순서대로 위→아래로 쌓아 가운데 맞추고,
 * 층 안 카드는 글 순서대로 한 줄(perRow개를 넘으면 다음 줄, 줄마다 가운데)에 그 줄에서 가장 높은 카드 높이로 둔다.
 * 이웃한 층 사이 선은 곧은 세로 화살표(라벨은 그 옆), 층을 건너뛰는 선은 상자들 오른쪽 바깥으로 비켜 간다.
 */
export function stackLayers(spec: InfographicSpec): ArchitectureBase {
  const s = a.stack;
  const order = layerOrder(spec);
  const rowsOf = order.map((g) => {
    const cards = spec.nodes.filter((n) => n.group === g.id);
    return Array.from({ length: Math.ceil(cards.length / s.perRow) }, (_, i) => cards.slice(i * s.perRow, (i + 1) * s.perRow));
  });
  const rowWidth = (count: number) => count * a.card.width + (count - 1) * s.cardGap;
  const widths = order.map((g, i) =>
    Math.max(groupTitleWidth(g.title), ...rowsOf[i]!.map((row) => rowWidth(row.length) + a.group.padding * 2)),
  );
  const centre = t.spacing.margin + Math.max(...widths) / 2;

  const nodes: LayoutNode[] = [];
  const boxes = new Map<string, LayoutGroup>();
  let top = t.spacing.header;
  order.forEach((g, i) => {
    let y = top + a.group.header;
    for (const row of rowsOf[i]!) {
      const sizes = row.map((n) => cardSize(n.title));
      const height = Math.max(...sizes.map((size) => size.height));
      const left = centre - rowWidth(row.length) / 2;
      row.forEach((n, j) => {
        nodes.push({
          id: n.id,
          x: left + j * (a.card.width + s.cardGap),
          y,
          width: a.card.width,
          height,
          titleLines: sizes[j]!.titleLines,
          descriptionLines: [],
          emphasis: false,
          icon: n.icon ?? 'generic',
        });
      });
      y += height + s.cardGap;
    }
    const height = y - s.cardGap + a.group.padding - top;
    boxes.set(g.id, { id: g.id, title: g.title, x: centre - widths[i]! / 2, y: top, width: widths[i]!, height, depth: 0 });
    top += height + a.spacing.betweenLayers;
  });
  // 카드는 Spec 순서로 돌려준다 (그리는 순서·끌기 대상이 다른 배치와 같게)
  const nodeOrder = new Map(spec.nodes.map((n, i) => [n.id, i]));
  nodes.sort((p, q) => nodeOrder.get(p.id)! - nodeOrder.get(q.id)!);

  const level = new Map(order.map((g, i) => [g.id, i]));
  const pairKey = (from: string, to: string) => [level.get(from)!, level.get(to)!].sort((p, q) => p - q).join('-');
  const pairs = new Map<string, number>();
  for (const [from, to] of spec.edges) pairs.set(pairKey(from, to), (pairs.get(pairKey(from, to)) ?? 0) + 1);
  const drawn = new Map<string, number>();
  let detours = 0;
  const edges: LayoutEdge[] = spec.edges.map(([from, to, meta]) => {
    const source = boxes.get(from)!;
    const target = boxes.get(to)!;
    const size = meta?.label ? labelSize(meta.label) : undefined;
    let points: { x: number; y: number }[];
    let label: EdgeLabel | undefined;
    if (Math.abs(level.get(from)! - level.get(to)!) === 1) {
      // 이웃한 층: 곧은 세로 화살표. 같은 두 층 사이 선이 여럿이면 가운데를 두고 나란히
      const key = pairKey(from, to);
      const count = pairs.get(key)!;
      const index = drawn.get(key) ?? 0;
      drawn.set(key, index + 1);
      const x = centre + (index - (count - 1) / 2) * s.lineGap;
      const down = level.get(from)! < level.get(to)!;
      const [upper, lower] = down ? [source, target] : [target, source];
      const [y1, y2] = [upper.y + upper.height, lower.y];
      points = down
        ? [
            { x, y: y1 },
            { x, y: y2 },
          ]
        : [
            { x, y: y2 },
            { x, y: y1 },
          ];
      if (size && meta?.label) {
        // 가운데보다 왼쪽 선의 라벨은 왼쪽에 둔다 (나란한 선의 라벨이 겹치지 않게)
        const leftSide = count > 1 && index < (count - 1) / 2;
        label = { text: meta.label, ...size, x: leftSide ? x - s.labelGap - size.width : x + s.labelGap, y: (y1 + y2) / 2 - size.height / 2 };
      }
    } else {
      // 층을 건너뛰는 선: 사이 층들의 오른쪽 바깥으로 비켜 간다
      const [lo, hi] = [level.get(from)!, level.get(to)!].sort((p, q) => p - q) as [number, number];
      const right = Math.max(...order.slice(lo, hi + 1).map((g) => boxes.get(g.id)!.x + boxes.get(g.id)!.width));
      detours += 1;
      const x = right + detours * s.detour;
      const [y1, y2] = [source.y + source.height / 2, target.y + target.height / 2];
      points = [
        { x: source.x + source.width, y: y1 },
        { x, y: y1 },
        { x, y: y2 },
        { x: target.x + target.width, y: y2 },
      ];
      if (size && meta?.label) label = { text: meta.label, ...size, x: x + s.labelGap, y: (y1 + y2) / 2 - size.height / 2 };
    }
    return {
      from,
      to,
      path: pathOf(points),
      end: points[points.length - 1]!,
      arrow: meta?.bidirectional ? 'both' : 'end',
      ...(label ? { label } : {}),
    };
  });

  const groups = (spec.groups ?? []).map((g) => boxes.get(g.id)!);
  return { title: spec.title, nodes, groups, edges, ...canvasSize(spec.title, nodes, groups, edges) };
}

/** 선의 꺾은 점들 (container 기준). ELK가 한 선을 여러 구간(section)으로 나누면 순서대로 잇는다. */
function edgePoints(edge: ElkExtendedEdge): ElkPoint[] {
  const points: ElkPoint[] = [];
  for (const section of edge.sections ?? []) {
    for (const p of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
      const last = points[points.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) points.push(p);
    }
  }
  return points;
}
