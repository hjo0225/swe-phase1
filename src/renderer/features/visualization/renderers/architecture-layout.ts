import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
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

/** Spec → ELK 그래프 → 절대 좌표. 제목 영역(t.spacing.header)과 여백(t.spacing.margin)만큼 옮겨 둔다. */
export async function layoutArchitectureBase(spec: InfographicSpec): Promise<ArchitectureBase> {
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

/** 캔버스는 카드·그룹·선 라벨을 모두 여백을 두고 품고, 제목이 들어갈 만큼은 넓다 */
function canvasSize(title: string, nodes: LayoutNode[], groups: LayoutGroup[], edges: LayoutEdge[]): { width: number; height: number } {
  const boxes = [...nodes, ...groups, ...edges.flatMap((e) => (e.label ? [e.label] : []))];
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
  const byId = new Map(nodes.map((n) => [n.id, n]));

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

  const edges = base.edges.map((e) =>
    movedIds.has(e.from) || movedIds.has(e.to) ? elbow(byId.get(e.from)!, byId.get(e.to)!, e) : e,
  );

  return { title: base.title, nodes, groups, edges, panels: [], ...canvasSize(spec.title, nodes, groups, edges) };
}

const overlapX = (p: LayoutNode, q: LayoutNode) => p.x < q.x + q.width && q.x < p.x + p.width;

/**
 * 두 카드의 마주 보는 면을 잇는 직각 꺾은선. 가로로 떨어져 있으면 옆면 → 가운데 세로 선분 → 옆면,
 * 가로로 겹치면 윗면·아랫면 → 가운데 가로 선분. 화살표·라벨은 그대로 두고 라벨은 가운데 선분의 가운데에 놓는다.
 */
function elbow(p: LayoutNode, q: LayoutNode, edge: LayoutEdge): LayoutEdge {
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
