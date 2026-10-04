import { z } from 'zod';

/**
 * InfographicSpec — Shared Kernel (docs/backend/visualization/domain-model.md, D-11).
 * Main은 LLM 결과 검증에, Renderer는 본문에 저장된 Spec을 그리기 전 검증에 같은 규칙을 쓴다.
 * LLM이 정하는 것(유형·제목·노드·연결)을 담는다. 좌표·색·폰트는 Blink가 정한다.
 * 예외로 사용자가 손으로 옮긴 카드 위치(positions)를 담는다 — LLM 스키마에는 없고 편집기에서만 쓴다.
 */

/** LLM에 허용하는 유형 = Renderer가 구현한 유형 (BR-VIS-01). Renderer를 추가할 때 함께 늘린다. */
export const SUPPORTED_TYPES = ['process', 'hierarchy', 'comparison', 'mindmap'] as const;
export type InfographicType = (typeof SUPPORTED_TYPES)[number];

export interface InfographicNode {
  id: string;
  title: string;
  description?: string;
}

export interface InfographicSpec {
  version: 1;
  type: InfographicType;
  title: string;
  nodes: InfographicNode[];
  edges: [from: string, to: string][];
  /** 사용자가 끌어다 놓은 카드의 왼쪽 위 좌표 (노드 id별). 없는 카드는 기본 배치를 따른다. */
  positions?: Record<string, CardPosition>;
}

export interface CardPosition {
  x: number;
  y: number;
}

export type InfographicSpecErrorReason =
  | 'SHAPE'
  | 'UNSUPPORTED_TYPE'
  | 'NODE_COUNT'
  | 'DUPLICATE_ID'
  | 'DANGLING_EDGE'
  | 'SELF_EDGE'
  | 'STRUCTURE';

export class InfographicSpecError extends Error {
  constructor(
    readonly reason: InfographicSpecErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'InfographicSpecError';
  }
}

const MIN_NODES = 2;
const MAX_NODES = 16;

const ShapeSchema = z.object({
  version: z.literal(1),
  type: z.string(),
  title: z.string().trim().min(1).max(60),
  nodes: z.array(
    z.object({
      id: z.string().trim().min(1).max(40),
      title: z.string().trim().min(1).max(40),
      description: z.string().trim().max(120).optional(),
    }),
  ),
  edges: z.array(z.tuple([z.string().trim(), z.string().trim()])),
  positions: z.record(z.string(), z.object({ x: z.number().refine(Number.isFinite), y: z.number().refine(Number.isFinite) })).optional(),
});

/** 형식 검증 → 정규화 → 구조 불변식. 같은 Spec에 다시 적용해도 결과가 같다. */
export function parseInfographicSpec(raw: unknown): InfographicSpec {
  const shape = ShapeSchema.safeParse(raw);
  if (!shape.success) throw new InfographicSpecError('SHAPE', shape.error.issues[0]?.message ?? 'Invalid shape');
  const input = shape.data;

  if (!(SUPPORTED_TYPES as readonly string[]).includes(input.type)) {
    throw new InfographicSpecError('UNSUPPORTED_TYPE', `Unsupported type ${input.type}`);
  }
  const type = input.type as InfographicType;
  if (input.nodes.length < MIN_NODES || input.nodes.length > MAX_NODES) {
    throw new InfographicSpecError('NODE_COUNT', `Expected ${MIN_NODES}-${MAX_NODES} nodes`);
  }

  const nodes: InfographicNode[] = input.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    ...(n.description ? { description: n.description } : {}),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new InfographicSpecError('DUPLICATE_ID', 'Node ids must be unique');

  const seen = new Set<string>();
  let edges: [string, string][] = [];
  for (const [from, to] of input.edges) {
    if (from === to) throw new InfographicSpecError('SELF_EDGE', `Edge ${from} points to itself`);
    if (!ids.has(from) || !ids.has(to)) throw new InfographicSpecError('DANGLING_EDGE', `Edge ${from}→${to} has no node`);
    const key = `${from}\u0000${to}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push([from, to]);
    }
  }
  if (type === 'process' && edges.length === 0) {
    edges = nodes.slice(1).map((n, i) => [nodes[i]!.id, n.id]);
  }

  const spec: InfographicSpec =
    type === 'comparison'
      ? splitSharedFeatures({ version: 1, type, title: input.title, nodes, edges })
      : { version: 1, type, title: input.title, nodes, edges };
  if (spec.nodes.length > MAX_NODES) throw new InfographicSpecError('NODE_COUNT', `Expected ${MIN_NODES}-${MAX_NODES} nodes`);
  STRUCTURE_RULES[type](spec);
  const positions = keepPositions(input.positions, spec.nodes);
  return positions ? { ...spec, positions } : spec;
}

/** 지금 있는 카드의 위치만 정수로 남긴다. 하나도 없으면 undefined (기본 배치). */
function keepPositions(
  raw: Record<string, CardPosition> | undefined,
  nodes: readonly InfographicNode[],
): Record<string, CardPosition> | undefined {
  if (!raw) return undefined;
  const kept = Object.fromEntries(
    nodes.filter((n) => raw[n.id]).map((n) => [n.id, { x: Math.round(raw[n.id]!.x), y: Math.round(raw[n.id]!.y) }]),
  );
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * comparison 정규화: 여러 비교 대상에 함께 연결된 특징(공통점)은 대상마다 하나씩 복제한다.
 * LLM은 "둘 다 X를 지원한다"를 노드 하나로 잇는 경우가 많다 — 열마다 같은 특징이 보이는 편이 비교표로도 자연스럽다.
 */
function splitSharedFeatures(spec: InfographicSpec): InfographicSpec {
  const { incoming, children } = degrees(spec);
  const shared = new Set(spec.nodes.filter((n) => incoming.get(n.id)! > 1 && children.get(n.id)!.length === 0).map((n) => n.id));
  if (shared.size === 0) return spec;
  const ids = new Set(spec.nodes.map((n) => n.id));
  const copies: InfographicNode[] = [];
  const edges = spec.edges.map(([from, to]): [string, string] => {
    if (!shared.has(to)) return [from, to];
    let id = `${to}@${from}`;
    for (let n = 2; ids.has(id); n += 1) id = `${to}@${from}#${n}`;
    ids.add(id);
    copies.push({ ...spec.nodes.find((node) => node.id === to)!, id });
    return [from, id];
  });
  return { ...spec, nodes: [...spec.nodes.filter((n) => !shared.has(n.id)), ...copies], edges };
}

function degrees(spec: InfographicSpec) {
  const incoming = new Map(spec.nodes.map((n) => [n.id, 0]));
  const children = new Map<string, string[]>(spec.nodes.map((n) => [n.id, []]));
  for (const [from, to] of spec.edges) {
    incoming.set(to, incoming.get(to)! + 1);
    children.get(from)!.push(to);
  }
  return { incoming, children };
}

function reachableFrom(root: string, children: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    stack.push(...children.get(id)!);
  }
  return visited;
}

/** process: 모든 노드를 한 번씩 지나는 하나의 경로. */
function assertSinglePath(spec: InfographicSpec): void {
  const { incoming, children } = degrees(spec);
  const starts = spec.nodes.filter((n) => incoming.get(n.id) === 0);
  const branching = [...children.values()].some((c) => c.length > 1);
  const merging = [...incoming.values()].some((d) => d > 1);
  if (spec.edges.length !== spec.nodes.length - 1 || starts.length !== 1 || branching || merging) {
    throw new InfographicSpecError('STRUCTURE', 'A process must be a single path through every node');
  }
  if (reachableFrom(starts[0]!.id, children).size !== spec.nodes.length) {
    throw new InfographicSpecError('STRUCTURE', 'A process must connect every node');
  }
}

/** hierarchy: 루트 하나, 나머지는 부모 하나, 모두 루트에서 도달 가능. */
function assertTree(spec: InfographicSpec): void {
  const { incoming, children } = degrees(spec);
  const roots = spec.nodes.filter((n) => incoming.get(n.id) === 0);
  if (roots.length !== 1 || [...incoming.values()].some((d) => d > 1)) {
    throw new InfographicSpecError('STRUCTURE', 'A hierarchy must have one root and one parent per node');
  }
  if (reachableFrom(roots[0]!.id, children).size !== spec.nodes.length) {
    throw new InfographicSpecError('STRUCTURE', 'A hierarchy must connect every node');
  }
}

/** mindmap: hierarchy 규칙 + 깊이 ≤ 2 (중심 → 주제 → 세부). */
function assertMindmap(spec: InfographicSpec): void {
  assertTree(spec);
  const { incoming, children } = degrees(spec);
  const center = spec.nodes.find((n) => incoming.get(n.id) === 0)!.id;
  const tooDeep = children.get(center)!.some((topic) => children.get(topic)!.some((detail) => children.get(detail)!.length > 0));
  if (tooDeep) throw new InfographicSpecError('STRUCTURE', 'A mindmap goes at most center → topic → detail');
}

const MIN_COMPARED = 2;
const MAX_COMPARED = 3;

/** comparison: 비교 대상(루트) 2~3개, 나머지는 특징 노드로 비교 대상 하나에만 딸리고, 대상마다 특징 ≥ 1. */
function assertComparison(spec: InfographicSpec): void {
  const { incoming, children } = degrees(spec);
  const items = spec.nodes.filter((n) => incoming.get(n.id) === 0);
  const features = spec.nodes.filter((n) => incoming.get(n.id) !== 0);
  const valid =
    items.length >= MIN_COMPARED &&
    items.length <= MAX_COMPARED &&
    items.every((item) => children.get(item.id)!.length > 0) &&
    features.every((f) => incoming.get(f.id) === 1 && children.get(f.id)!.length === 0);
  if (!valid) {
    throw new InfographicSpecError('STRUCTURE', 'A comparison needs 2-3 items, each with its own features');
  }
}

const STRUCTURE_RULES: Record<InfographicType, (spec: InfographicSpec) => void> = {
  process: assertSinglePath,
  hierarchy: assertTree,
  comparison: assertComparison,
  mindmap: assertMindmap,
};

/**
 * Structured Output용 JSON Schema. strict 모드에 맞게 모든 필드를 required, additionalProperties false로 둔다.
 * 연결은 {from, to} 객체로 받고 실행기가 [from, to]로 바꾼다. 구조 규칙은 JSON Schema로 표현할 수 없어 parse가 사후 검사한다.
 */
export function infographicJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'type', 'title', 'nodes', 'edges'],
    properties: {
      version: { type: 'integer', enum: [1] },
      type: { type: 'string', enum: [...SUPPORTED_TYPES] },
      title: { type: 'string', description: 'Infographic title, 60 characters or fewer' },
      nodes: {
        type: 'array',
        description: `${MIN_NODES}–${MAX_NODES} nodes`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'description'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string', description: '40 characters or fewer' },
            description: { type: 'string', description: '120 characters or fewer, or an empty string' },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to'],
          properties: { from: { type: 'string' }, to: { type: 'string' } },
        },
      },
    },
  };
}
