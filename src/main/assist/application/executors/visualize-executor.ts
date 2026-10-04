import { infographicJsonSchema, parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { VISUALIZE_PROMPT } from '../prompts';
import { nameOf, outlineContainers, unnestFlowComponents, type OutlineContainer } from './components-outline';

/** 시각화: Structured Output → 형식 검증 → 구조 불변식·정규화 (명세서 §15). 이미지 생성 모델은 쓰지 않는다. */
export class VisualizeExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    // 연결에도 나오는 구성요소 아래의 항목을 그 옆으로 올려 보낸다 (상자가 아니라 카드로 그려지게)
    const text = unnestFlowComponents(input.text);
    const raw = await llm.generateStructured({
      system: VISUALIZE_PROMPT,
      user: text,
      schemaName: 'infographic_spec',
      jsonSchema: infographicJsonSchema(),
      signal,
    });
    return JobResults.infographic(parseInfographicSpec(componentsNotBoxes(addOutlineGroups(fromLLMShape(raw), outlineContainers(text)))));
  }
}

type Named = { id?: unknown; title?: unknown; group?: unknown; parent?: unknown };

/** parse가 받는 그룹 수·중첩 한도 (넘으면 시각화 전체가 거절되므로 그 전에 멈춘다) */
const MAX_GROUPS = 12;
const MAX_GROUP_DEPTH = 3;

/**
 * 구성요소 목록이 담는다고 적은 상자를 모델이 빠뜨렸으면 더한다 (목록의 중첩이 그룹의 근거다).
 * 모델이 이미 그린 상자(같은 이름)와 카드의 자리는 그대로 두고, 그룹이 없는 카드만 목록대로 넣는다.
 * 상자를 더할 뿐 카드·선은 바꾸지 않는다. 납작한 목록(담는 것이 없는 글)에는 아무것도 하지 않는다.
 */
function addOutlineGroups(shape: unknown, containers: readonly OutlineContainer[]): unknown {
  if (containers.length === 0 || typeof shape !== 'object' || shape === null) return shape;
  const spec = shape as { type?: unknown; nodes?: unknown; groups?: unknown };
  if (spec.type !== 'architecture' || !Array.isArray(spec.nodes)) return shape;
  const groups = [...((Array.isArray(spec.groups) ? spec.groups : []) as Named[])];
  const nodes = [...(spec.nodes as Named[])];
  const taken = new Set([...groups.map((g) => g.id), ...nodes.map((n) => n.id)]);
  const groupIdOf = new Map<string, unknown>(groups.map((g) => [nameOf(String(g.title ?? '')), g.id]));
  const depthOf = (id: unknown): number => {
    let depth = 0;
    for (let g: unknown = id; g; g = groups.find((x) => x.id === g)?.parent) depth++;
    return depth;
  };
  let next = 1;
  for (const container of containers) {
    const name = nameOf(container.title);
    let id = groupIdOf.get(name);
    if (id === undefined) {
      const parent = container.parent ? groupIdOf.get(nameOf(container.parent)) : undefined;
      if (container.parent && parent === undefined) continue; // 바깥 상자를 못 그렸으면 안쪽도 두지 않는다
      if (groups.length >= MAX_GROUPS || depthOf(parent) + 1 > MAX_GROUP_DEPTH) continue;
      while (taken.has(`o${next}`)) next++;
      id = `o${next}`;
      taken.add(id);
      groups.push({ id, title: container.title, ...(parent ? { parent } : {}) });
      groupIdOf.set(name, id);
    }
    const parts = new Set(container.parts.map(nameOf));
    nodes.forEach((n, i) => {
      if (!n.group && parts.has(nameOf(String(n.title ?? '')))) nodes[i] = { ...n, group: id };
    });
  }
  return { ...spec, nodes, groups };
}

/**
 * 선이 닿는 구성요소는 상자(그룹)가 아니라 카드다. 정리된 목록에서 선에도 나오는 항목 아래에 무언가를 넣으면
 * (예: "Main" 아래 job queue) 모델이 그 항목을 상자로 만들어, 같은 이름의 카드를 하나 더 두거나 선을 상자에 잇곤 한다.
 * - 선이 상자를 가리키면: 그 상자를 열어(안의 카드·그룹은 한 단계 위로) 같은 자리에 같은 이름의 카드를 두고 선을 잇는다.
 *   전체 시각화가 검증에서 거절되지 않는다.
 * - 상자와 이름이 같은 카드: 선이 없으면 이름만 되풀이하므로 빼고, 선이 있으면 카드를 남기고 상자를 연다.
 * - 자기 자신을 가리키는 선은 그릴 수 없어 뺀다.
 * 카드와 (그릴 수 있는) 선은 하나도 잃지 않는다. 바뀌는 것은 상자뿐이다.
 */
function componentsNotBoxes(shape: unknown): unknown {
  if (typeof shape !== 'object' || shape === null) return shape;
  const spec = shape as { type?: unknown; nodes?: unknown; groups?: unknown; edges?: unknown };
  // 다른 유형은 그대로 parse에 맡긴다 (자기 자신을 가리키는 선도 지금처럼 거절)
  if (spec.type !== 'architecture') return shape;
  if (!Array.isArray(spec.nodes) || !Array.isArray(spec.groups) || !Array.isArray(spec.edges)) return shape;
  const key = (title: unknown) => (typeof title === 'string' ? title.trim().toLowerCase() : '');
  const groups = spec.groups as Named[];
  const edges = spec.edges as unknown[];
  const ends = (e: unknown): unknown[] => (Array.isArray(e) ? [e[0], e[1]] : []);
  const nodeIds = new Set((spec.nodes as Named[]).map((n) => n.id));
  const groupNames = new Set(groups.map((g) => key(g.title)).filter(Boolean));
  const linked = new Set(edges.flatMap(ends));
  let nodes = (spec.nodes as Named[]).filter((n) => !(groupNames.has(key(n.title)) && !linked.has(n.id)));

  const cardByName = new Map(nodes.map((n) => [key(n.title), n.id]));
  const pointedAt = new Set(edges.flatMap(ends).filter((id) => !nodeIds.has(id) && groups.some((g) => g.id === id)));
  const opened = new Map(
    groups.filter((g) => pointedAt.has(g.id) || cardByName.has(key(g.title))).map((g) => [g.id, g.parent]),
  );
  // 연 상자의 부모로 올린다 (연 상자가 겹쳐 있으면 남는 조상까지)
  const lift = (id: unknown): unknown => {
    let current = id;
    while (opened.has(current)) current = opened.get(current);
    return current;
  };
  const moveUp = <T extends Named>(x: T, field: 'group' | 'parent'): T => {
    if (!opened.has(x[field])) return x;
    const target = lift(x[field]);
    const { [field]: _old, ...rest } = x;
    return (typeof target === 'string' && target ? { ...rest, [field]: target } : rest) as T;
  };
  // 선이 가리킨 상자 → 같은 이름의 카드 (이미 있으면 그 카드로 잇는다)
  const cardFor = new Map<unknown, unknown>();
  for (const g of groups.filter((g) => pointedAt.has(g.id))) {
    const existing = cardByName.get(key(g.title));
    if (existing !== undefined) {
      cardFor.set(g.id, existing);
    } else {
      cardFor.set(g.id, g.id);
      nodes = [...nodes, moveUp({ id: g.id, title: g.title, group: g.parent }, 'group')];
    }
  }
  const retarget = (id: unknown) => (cardFor.has(id) ? cardFor.get(id) : id);
  return {
    ...spec,
    nodes: nodes.map((n) => moveUp(n, 'group')),
    groups: groups.filter((g) => !opened.has(g.id)).map((g) => moveUp(g, 'parent')),
    edges: edges
      .map((e) => (Array.isArray(e) ? [retarget(e[0]), retarget(e[1]), ...e.slice(2)] : e))
      .filter((e) => !Array.isArray(e) || e[0] !== e[1]),
  };
}

/** parse가 거절하는 길이(SHAPE). 조금 긴 라벨·그룹 이름 하나로 시각화 전체가 실패하지 않도록 미리 줄인다. */
const MAX_EDGE_LABEL = 24;
const MAX_GROUP_TITLE = 30;

/**
 * LLM 모양 → 저장 모양. strict JSON Schema 때문에 LLM은 모든 필드를 채워 보낸다:
 * 연결 {from, to, label, bidirectional} → [from, to] 또는 [from, to, {label?, bidirectional?}],
 * 빈 group·parent, icon 'none'은 뺀다. 유형별로 쓰지 않는 필드는 parse가 지운다.
 */
function fromLLMShape(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const spec = raw as { edges?: unknown; nodes?: unknown; groups?: unknown };
  const nodes = Array.isArray(spec.nodes) ? spec.nodes.map(toNode) : undefined;
  const groups = Array.isArray(spec.groups) ? spec.groups.map(toGroup) : undefined;
  return {
    ...raw,
    ...(Array.isArray(spec.edges) ? { edges: spec.edges.map(toEdge) } : {}),
    ...(nodes && groups ? separateGroupIds(nodes, groups) : { ...(nodes ? { nodes } : {}), ...(groups ? { groups } : {}) }),
  };
}

/**
 * LLM은 노드와 그룹에 번호를 따로 매기기도 한다(노드 "1", 그룹 "1"). 그룹 id는 노드 group·그룹 parent에서만
 * 가리키므로, 노드 id와 겹치는 그룹 id는 "g1"처럼 바꾸고 그 참조도 함께 바꾼다. 그룹끼리 겹치는 id는 parse가 거절한다.
 */
function separateGroupIds(nodes: unknown[], groups: unknown[]): { nodes: unknown[]; groups: unknown[] } {
  const idOf = (x: unknown): unknown => (typeof x === 'object' && x !== null ? (x as { id?: unknown }).id : undefined);
  const nodeIds = new Set(nodes.map(idOf));
  const taken = new Set([...nodeIds, ...groups.map(idOf)]);
  const renamed = new Map<string, string>();
  for (const id of groups.map(idOf)) {
    if (typeof id !== 'string' || !nodeIds.has(id) || renamed.has(id)) continue;
    let next = `g${id}`;
    for (let i = 2; taken.has(next); i++) next = `g${id}-${i}`;
    taken.add(next);
    renamed.set(id, next);
  }
  if (renamed.size === 0) return { nodes, groups };
  const rename = <T,>(x: T, key: 'id' | 'group' | 'parent'): T => {
    if (typeof x !== 'object' || x === null) return x;
    const value = (x as Record<string, unknown>)[key];
    return typeof value === 'string' && renamed.has(value) ? { ...x, [key]: renamed.get(value) } : x;
  };
  return {
    nodes: nodes.map((n) => rename(n, 'group')),
    groups: groups.map((g) => rename(rename(g, 'id'), 'parent')),
  };
}

function toEdge(e: unknown): unknown {
  if (typeof e !== 'object' || e === null || !('from' in e) || !('to' in e)) return e;
  const { from, to, label, bidirectional } = e as { from: unknown; to: unknown; label?: unknown; bidirectional?: unknown };
  const meta = {
    ...(typeof label === 'string' && label.trim() ? { label: shorten(label, MAX_EDGE_LABEL) } : {}),
    ...(bidirectional === true ? { bidirectional: true } : {}),
  };
  return Object.keys(meta).length > 0 ? [from, to, meta] : [from, to];
}

function toNode(n: unknown): unknown {
  if (typeof n !== 'object' || n === null) return n;
  const { group, icon, ...rest } = n as { group?: unknown; icon?: unknown };
  return {
    ...rest,
    ...(typeof group === 'string' && group.trim() ? { group } : {}),
    ...(typeof icon === 'string' && icon !== 'none' ? { icon } : {}),
  };
}

function toGroup(g: unknown): unknown {
  if (typeof g !== 'object' || g === null) return g;
  const { parent, title, ...rest } = g as { parent?: unknown; title?: unknown };
  return {
    ...rest,
    title: typeof title === 'string' ? shorten(title, MAX_GROUP_TITLE) : title,
    ...(typeof parent === 'string' && parent.trim() ? { parent } : {}),
  };
}

/** 앞뒤 공백을 뺀 뒤 max자를 넘으면 잘라 "…"로 끝낸다 (결과는 max자 이하, 문자 단위로 자른다). */
function shorten(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  let cut = '';
  for (const ch of trimmed) {
    if (cut.length + ch.length > max - 1) break;
    cut += ch;
  }
  return `${cut.trimEnd()}…`;
}
