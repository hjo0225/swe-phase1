import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme } from '../theme/infographic-theme';
import { widthOf, wrapText, type EdgeLabel, type LayoutEdge, type LayoutGroup, type LayoutNode } from './layout';

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

  // 캔버스는 카드·그룹·선 라벨을 모두 품는다
  const boxes = [...nodes, ...layoutGroups, ...layoutEdges.flatMap((e) => (e.label ? [e.label] : []))];
  const titleWidth = t.spacing.margin * 2 + widthOf(spec.title) * t.title.size;
  return {
    title: spec.title,
    nodes,
    groups: layoutGroups,
    edges: layoutEdges,
    width: Math.max(titleWidth, ...boxes.map((b) => b.x + b.width + t.spacing.margin)),
    height: Math.max(...boxes.map((b) => b.y + b.height + t.spacing.margin)),
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
