import type { InfographicNode, InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme as t } from '../theme/infographic-theme';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  titleLines: string[];
  descriptionLines: string[];
  /** process의 시작, hierarchy·mindmap의 루트, comparison의 비교 대상 — 강조 색으로 그린다 */
  emphasis: boolean;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** SVG path d */
  path: string;
  end: { x: number; y: number };
}

export interface LayoutPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InfographicLayout {
  width: number;
  height: number;
  title: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** 카드 묶음 배경 (comparison의 열) */
  panels: LayoutPanel[];
}

const PER_ROW = 4;

/** 공백 단위로 줄을 나누고, 한 단어가 너무 길면 글자 단위로 자른다. 폭은 글자 수로 근사한다. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
    } else if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function measure(node: InfographicNode) {
  const titleLines = wrapText(node.title, t.nodeTitle.maxChars);
  const descriptionLines = wrapText(node.description ?? '', t.nodeDescription.maxChars);
  const height =
    t.card.padding * 2 +
    titleLines.length * t.nodeTitle.lineHeight +
    (descriptionLines.length ? t.spacing.descGap + descriptionLines.length * t.nodeDescription.lineHeight : 0);
  return { titleLines, descriptionLines, height };
}

/** Spec → 좌표. 순수 함수라 React 없이 테스트한다. 디자인(좌표·크기)은 전부 여기서 Blink가 정한다. */
export function layoutInfographic(spec: InfographicSpec): InfographicLayout {
  switch (spec.type) {
    case 'process':
      return layoutProcess(spec);
    case 'hierarchy':
      return layoutHierarchy(spec);
    case 'comparison':
      return layoutComparison(spec);
    case 'mindmap':
      return layoutMindmap(spec);
  }
}

function childrenOf(spec: InfographicSpec) {
  const children = new Map<string, string[]>(spec.nodes.map((n) => [n.id, []]));
  const targets = new Set<string>();
  for (const [from, to] of spec.edges) {
    children.get(from)!.push(to);
    targets.add(to);
  }
  return { children, roots: spec.nodes.filter((n) => !targets.has(n.id)).map((n) => n.id) };
}

function card(node: InfographicNode, x: number, y: number, emphasis: boolean): LayoutNode {
  const m = measure(node);
  return { id: node.id, x, y, width: t.card.width, ...m, emphasis };
}

function layoutProcess(spec: InfographicSpec): InfographicLayout {
  const next = new Map(spec.edges.map(([from, to]) => [from, to]));
  const targets = new Set(spec.edges.map(([, to]) => to));
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const order: InfographicNode[] = [];
  for (let id: string | undefined = spec.nodes.find((n) => !targets.has(n.id))?.id; id; id = next.get(id)) {
    order.push(byId.get(id)!);
  }

  const measured = order.map(measure);
  const rows = Math.ceil(order.length / PER_ROW);
  const rowHeights = Array.from({ length: rows }, (_, r) =>
    Math.max(...measured.slice(r * PER_ROW, (r + 1) * PER_ROW).map((m) => m.height)),
  );
  const rowTop = (r: number) => t.spacing.header + rowHeights.slice(0, r).reduce((sum, h) => sum + h + t.spacing.rowGap, 0);

  const placed = new Map<string, LayoutNode>();
  order.forEach((node, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    placed.set(node.id, {
      id: node.id,
      x: t.spacing.margin + col * (t.card.width + t.spacing.columnGap),
      y: rowTop(row),
      width: t.card.width,
      height: measured[i]!.height,
      titleLines: measured[i]!.titleLines,
      descriptionLines: measured[i]!.descriptionLines,
      emphasis: i === 0,
    });
  });

  const columns = Math.min(order.length, PER_ROW);
  return {
    title: spec.title,
    width: t.spacing.margin * 2 + columns * t.card.width + (columns - 1) * t.spacing.columnGap,
    height: rowTop(rows - 1) + rowHeights[rows - 1]! + t.spacing.margin,
    nodes: spec.nodes.map((n) => placed.get(n.id)!),
    edges: spec.edges.map(([from, to]) => connect(placed.get(from)!, placed.get(to)!)),
    panels: [],
  };
}

function layoutHierarchy(spec: InfographicSpec): InfographicLayout {
  const children = new Map<string, string[]>(spec.nodes.map((n) => [n.id, []]));
  const targets = new Set<string>();
  for (const [from, to] of spec.edges) {
    children.get(from)!.push(to);
    targets.add(to);
  }
  const rootId = spec.nodes.find((n) => !targets.has(n.id))!.id;
  const measured = new Map(spec.nodes.map((n) => [n.id, measure(n)]));

  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of children.get(id)!) {
      depth.set(child, depth.get(id)! + 1);
      queue.push(child);
    }
  }
  const levels = Math.max(...depth.values()) + 1;
  const levelHeights = Array.from({ length: levels }, (_, d) =>
    Math.max(...spec.nodes.filter((n) => depth.get(n.id) === d).map((n) => measured.get(n.id)!.height)),
  );
  const levelTop = (d: number) =>
    t.spacing.header + levelHeights.slice(0, d).reduce((sum, h) => sum + h + t.spacing.levelGap, 0);

  const subtreeWidth = new Map<string, number>();
  const widthOf = (id: string): number => {
    const kids = children.get(id)!;
    const width = kids.length
      ? Math.max(t.card.width, kids.reduce((sum, k) => sum + widthOf(k), 0) + (kids.length - 1) * t.spacing.siblingGap)
      : t.card.width;
    subtreeWidth.set(id, width);
    return width;
  };
  const totalWidth = widthOf(rootId);

  const placed = new Map<string, LayoutNode>();
  const place = (id: string, left: number): number => {
    const kids = children.get(id)!;
    let center: number;
    if (kids.length === 0) {
      center = left + t.card.width / 2;
    } else {
      const kidsWidth = kids.reduce((sum, k) => sum + subtreeWidth.get(k)!, 0) + (kids.length - 1) * t.spacing.siblingGap;
      let cursor = left + (subtreeWidth.get(id)! - kidsWidth) / 2;
      const centers = kids.map((k) => {
        const c = place(k, cursor);
        cursor += subtreeWidth.get(k)! + t.spacing.siblingGap;
        return c;
      });
      center = (centers[0]! + centers[centers.length - 1]!) / 2;
    }
    const m = measured.get(id)!;
    placed.set(id, {
      id,
      x: center - t.card.width / 2,
      y: levelTop(depth.get(id)!),
      width: t.card.width,
      height: m.height,
      titleLines: m.titleLines,
      descriptionLines: m.descriptionLines,
      emphasis: id === rootId,
    });
    return center;
  };
  place(rootId, t.spacing.margin);

  return {
    title: spec.title,
    width: t.spacing.margin * 2 + totalWidth,
    height: levelTop(levels - 1) + levelHeights[levels - 1]! + t.spacing.margin,
    nodes: spec.nodes.map((n) => placed.get(n.id)!),
    edges: spec.edges.map(([from, to]) => connect(placed.get(from)!, placed.get(to)!)),
    panels: [],
  };
}

/** comparison: 비교 대상마다 한 열. 대상 카드가 맨 위, 특징은 아래로 쌓고 같은 순번의 특징끼리 줄을 맞춘다. */
function layoutComparison(spec: InfographicSpec): InfographicLayout {
  const { children, roots } = childrenOf(spec);
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const pad = t.spacing.panelPadding;
  const columnX = (c: number) => t.spacing.margin + pad + c * (t.card.width + pad * 2 + t.spacing.columnGap);

  const columns = roots.map((id) => [id, ...children.get(id)!]);
  const rowCount = Math.max(...columns.map((col) => col.length));
  const rowHeights = Array.from({ length: rowCount }, (_, r) =>
    Math.max(...columns.map((col) => (col[r] ? measure(byId.get(col[r])!).height : 0))),
  );
  const top = t.spacing.header + pad;
  const rowTop = (r: number) => top + rowHeights.slice(0, r).reduce((sum, h) => sum + h + t.spacing.stackGap, 0);

  const placed = new Map<string, LayoutNode>();
  columns.forEach((col, c) => col.forEach((id, r) => placed.set(id, card(byId.get(id)!, columnX(c), rowTop(r), r === 0))));
  const contentBottom = rowTop(rowCount - 1) + rowHeights[rowCount - 1]!;
  const panels = columns.map((_, c) => ({
    x: columnX(c) - pad,
    y: top - pad,
    width: t.card.width + pad * 2,
    height: contentBottom - top + pad * 2,
  }));
  const last = panels[panels.length - 1]!;
  return {
    title: spec.title,
    width: last.x + last.width + t.spacing.margin,
    height: last.y + last.height + t.spacing.margin,
    nodes: spec.nodes.map((n) => placed.get(n.id)!),
    edges: [],
    panels,
  };
}

/**
 * mindmap: 중심을 가운데 두고 주제를 오른쪽·왼쪽으로 나눈다(앞 절반이 오른쪽). 세부는 주제의 바깥쪽 열에 쌓는다.
 * 주제 하나와 그 세부가 한 묶음이고, 묶음을 세로로 쌓은 뒤 양쪽을 중심과 세로 가운데 맞춘다.
 */
function layoutMindmap(spec: InfographicSpec): InfographicLayout {
  const { children, roots } = childrenOf(spec);
  const centerId = roots[0]!;
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const heightOf = (id: string) => measure(byId.get(id)!).height;
  const topics = children.get(centerId)!;
  const rightTopics = topics.slice(0, Math.ceil(topics.length / 2));
  const leftTopics = topics.slice(rightTopics.length);
  const hasDetails = (side: string[]) => side.some((id) => children.get(id)!.length > 0);

  // 열: [왼쪽 세부] [왼쪽 주제] 중심 [오른쪽 주제] [오른쪽 세부] — 빈 열은 만들지 않는다.
  const step = t.card.width + t.spacing.columnGap;
  const leftColumns = (leftTopics.length > 0 ? 1 : 0) + (hasDetails(leftTopics) ? 1 : 0);
  const rightColumns = (rightTopics.length > 0 ? 1 : 0) + (hasDetails(rightTopics) ? 1 : 0);
  const columns = leftColumns + 1 + rightColumns;
  const centerX = t.spacing.margin + leftColumns * step;

  const detailsHeight = (topic: string) =>
    children.get(topic)!.reduce((sum, id) => sum + heightOf(id), 0) +
    Math.max(0, children.get(topic)!.length - 1) * t.spacing.stackGap;
  const groupHeight = (topic: string) => Math.max(heightOf(topic), detailsHeight(topic));
  const sideHeight = (side: string[]) =>
    side.reduce((sum, id) => sum + groupHeight(id), 0) + Math.max(0, side.length - 1) * t.spacing.groupGap;
  const contentHeight = Math.max(heightOf(centerId), sideHeight(rightTopics), sideHeight(leftTopics));
  const top = t.spacing.header;

  const placed = new Map<string, LayoutNode>();
  placed.set(centerId, card(byId.get(centerId)!, centerX, top + (contentHeight - heightOf(centerId)) / 2, true));
  const placeSide = (side: string[], direction: 1 | -1) => {
    let cursor = top + (contentHeight - sideHeight(side)) / 2;
    for (const topic of side) {
      const group = groupHeight(topic);
      placed.set(topic, card(byId.get(topic)!, centerX + direction * step, cursor + (group - heightOf(topic)) / 2, false));
      let detailY = cursor + (group - detailsHeight(topic)) / 2;
      for (const detail of children.get(topic)!) {
        placed.set(detail, card(byId.get(detail)!, centerX + direction * 2 * step, detailY, false));
        detailY += heightOf(detail) + t.spacing.stackGap;
      }
      cursor += group + t.spacing.groupGap;
    }
  };
  placeSide(rightTopics, 1);
  placeSide(leftTopics, -1);

  return {
    title: spec.title,
    width: t.spacing.margin * 2 + columns * t.card.width + (columns - 1) * t.spacing.columnGap,
    height: top + contentHeight + t.spacing.margin,
    nodes: spec.nodes.map((n) => placed.get(n.id)!),
    edges: spec.edges.map(([from, to]) => connectSideways(placed.get(from)!, placed.get(to)!)),
    panels: [],
  };
}

/** 가로로 떨어진 두 카드: 마주 보는 변의 가운데끼리 잇는다 (mindmap). */
function connectSideways(a: LayoutNode, b: LayoutNode): LayoutEdge {
  const toRight = b.x > a.x;
  const x1 = toRight ? a.x + a.width : a.x;
  const x2 = toRight ? b.x : b.x + b.width;
  const [y1, y2] = [a.y + a.height / 2, b.y + b.height / 2];
  const bend = (x2 - x1) / 2;
  return {
    from: a.id,
    to: b.id,
    path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    end: { x: x2, y: y2 },
  };
}

/** 같은 줄이면 옆으로, 아니면 아래로 이어지는 부드러운 곡선. */
function connect(a: LayoutNode, b: LayoutNode): LayoutEdge {
  if (a.y === b.y && b.x > a.x) {
    const [x1, y1, x2, y2] = [a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2];
    return { from: a.id, to: b.id, path: `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`, end: { x: x2, y: y2 } };
  }
  const [x1, y1, x2, y2] = [a.x + a.width / 2, a.y + a.height, b.x + b.width / 2, b.y];
  return { from: a.id, to: b.id, path: `M ${x1} ${y1} C ${x1} ${y1 + 32}, ${x2} ${y2 - 32}, ${x2} ${y2}`, end: { x: x2, y: y2 } };
}
