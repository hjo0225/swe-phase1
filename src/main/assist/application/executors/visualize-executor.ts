import { infographicJsonSchema, parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { visualizePrompt } from '../prompts';
import { nameOf, outlineContainers, outlineLayers, unnestFlowComponents, type OutlineContainer } from './components-outline';
import { isTechStackText } from './tech-stack';

/** 시각화: Structured Output → 형식 검증 → 구조 불변식·정규화 (명세서 §15). 이미지 생성 모델은 쓰지 않는다. */
export class VisualizeExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    // 연결에도 나오는 구성요소 아래의 항목을 그 옆으로 올려 보낸다 (상자가 아니라 카드로 그려지게)
    const text = unnestFlowComponents(input.text);
    // 기술 이름에 버전을 붙여 쌓은 글이면 층 규칙을 덧붙이고, 그때만 모델의 layers 답을 믿는다
    const techStack = isTechStackText(text);
    const raw = await llm.generateStructured({
      system: visualizePrompt(techStack),
      user: text,
      schemaName: 'infographic_spec',
      jsonSchema: infographicJsonSchema({ layers: techStack }),
      signal,
    });
    const shape = addOutlineGroups(knownGroupsOnly(fromLLMShape(raw)), outlineContainers(text));
    // 층 구조: 기술 스택 글을 모델이 층 구조라고 답했거나, 정리된 목록이 층끼리 잇는다(층 이름 둘 이상)
    const layers = (techStack && (isLayerStackAnswer(raw) || cardsAllInLayers(shape))) || outlineLayers(text).length >= 2;
    return JobResults.infographic(parseInfographicSpec(componentsNotBoxes(collapseLayers(shape, layers))));
  }
}

/** 모델이 글을 층 구조(지시문 규칙 6)라고 답했는가 — 구조화 출력의 layers 필드 */
const isLayerStackAnswer = (raw: unknown) => typeof raw === 'object' && raw !== null && (raw as { layers?: unknown }).layers === true;

/**
 * 모델이 layers를 false로 답해도, 기술 스택 글에서 모든 카드를 맨 바깥 상자 둘 이상에 나눠 담았으면 층 구조로 본다
 * (실제 API에서 층을 그대로 그리고 layers만 false로 답한 경우가 있었다).
 */
function cardsAllInLayers(shape: unknown): boolean {
  if (typeof shape !== 'object' || shape === null) return false;
  const spec = shape as { type?: unknown; nodes?: unknown; groups?: unknown };
  if (spec.type !== 'architecture' || !Array.isArray(spec.nodes) || !Array.isArray(spec.groups)) return false;
  const groups = spec.groups as Named[];
  const top = new Set(groups.filter((g) => !g.parent).map((g) => g.id));
  return top.size >= 2 && (spec.nodes as Named[]).every((n) => n.group !== undefined && groups.some((g) => g.id === n.group));
}

type Line = [from: unknown, to: unknown, meta?: { label?: string; bidirectional?: boolean }];

/**
 * 층 구조라고 답한 architecture를 층 사이 선만 있는 모양으로 모은다. 모델은 층(그룹)과 기술(카드)은 잘 나누지만
 * 선은 카드끼리 이어 그리곤 한다(기술 → 기술, 층 안의 선). 분류(layers)는 모델이 정하고, 선 정리는 여기서 정해진 규칙으로 한다:
 * - 층 안의 상자는 그 층의 카드가 된다 (상자가 품던 카드 바로 앞에, 안의 카드는 그 층으로)
 * - 그룹 밖 카드의 선이 모두 층 안의 한 카드에만 닿으면(그 기술이 부르는 서비스) 그 카드 이름 뒤 괄호에 적는다
 * - 두 층 사이에 서서 한 층에서 받아 다른 층으로만 넘기는 그룹 밖 카드(예: Preload / IPC)는 그 층 사이 선의 라벨이 된다
 * - 모든 선은 양 끝을 품은 층끼리의 선으로 바꾸고, 같은 층 안의 선은 뺀다. 같은 두 층 사이 선은 하나로 모은다
 *   (라벨은 모두 같을 때만 남긴다, 양방향이거나 양쪽으로 다 있으면 양방향)
 * 층이 아닌 글(layers가 false)은 건드리지 않는다.
 */
function collapseLayers(shape: unknown, layers: boolean): unknown {
  if (!layers || typeof shape !== 'object' || shape === null) return shape;
  const spec = shape as { type?: unknown; nodes?: unknown; groups?: unknown; edges?: unknown };
  if (spec.type !== 'architecture' || !Array.isArray(spec.nodes) || !Array.isArray(spec.groups) || !Array.isArray(spec.edges)) return shape;
  const groups = spec.groups as Named[];
  if (groups.length < 2) return shape;
  // 층들을 감싼 바깥 상자(예: Electron)가 하나 있으면 그 안의 상자들이 층이다. 바깥 상자는 테두리로 남긴다
  const holders = groups.filter((g) => !g.parent && groups.some((c) => c.parent === g.id));
  const frame = holders.length === 1 && groups.filter((c) => c.parent === holders[0]!.id).length >= 2 ? holders[0]! : undefined;
  const parentOf = new Map(groups.map((g) => [g.id, g.parent === frame?.id && frame ? undefined : g.parent]));
  const layerOf = (group: unknown): unknown => {
    let g = group;
    for (let hops = 0; parentOf.get(g) && hops < 16; hops++) g = parentOf.get(g);
    return g;
  };
  const top = groups.filter((g) => g !== frame && !parentOf.get(g.id));

  // 층 안의 상자 → 그 층의 카드 (품던 카드 바로 앞)
  let nodes: Named[] = [];
  const asCard = new Set<unknown>();
  const names = new Set((spec.nodes as Named[]).map((n) => String(n.title ?? '').trim().toLowerCase()));
  const boxCard = (g: Named) => {
    if (asCard.has(g.id)) return;
    asCard.add(g.id);
    if (!names.has(String(g.title ?? '').trim().toLowerCase())) nodes.push({ id: g.id, title: g.title, group: layerOf(g.id) });
  };
  for (const n of spec.nodes as Named[]) {
    if (n.group !== undefined && parentOf.get(n.group)) {
      // 품은 상자들(바깥 → 안쪽) 중 층이 아닌 것을 먼저 카드로
      const chain: Named[] = [];
      for (let g: unknown = n.group; parentOf.get(g); g = parentOf.get(g)) chain.unshift(groups.find((x) => x.id === g)!);
      chain.forEach(boxCard);
      nodes.push({ ...n, group: layerOf(n.group) });
    } else nodes.push(n);
  }
  for (const g of groups) if (parentOf.get(g.id) && !asCard.has(g.id)) boxCard(g); // 빈 상자도 기술 이름이다 (바깥 상자 안의 층은 아니다)

  const layerOfEnd = (id: unknown): unknown => {
    if (parentOf.has(id)) return layerOf(id); // 그룹(층 안 상자였던 카드 포함)은 그 층
    const node = nodes.find((n) => n.id === id);
    return node?.group !== undefined ? node.group : id;
  };
  let lines = (spec.edges as unknown[]).filter(Array.isArray) as Line[];

  // 층과 이름이 같은 그룹 밖 카드는 그 층 자신이다 → 카드를 빼고 그 선을 층에 잇는다
  const layerByName = new Map(top.map((g) => [nameOf(String(g.title ?? '')), g.id]));
  for (const n of nodes.filter((x) => x.group === undefined && layerByName.has(nameOf(String(x.title ?? ''))))) {
    const layer = layerByName.get(nameOf(String(n.title ?? '')));
    lines = lines.map((l): Line => [l[0] === n.id ? layer : l[0], l[1] === n.id ? layer : l[1], l[2]]);
    nodes = nodes.filter((x) => x !== n);
  }
  // 아무것도 가리키지 않는 선(모델이 id 대신 이름을 적은 것 등)은 그릴 수 없어 뺀다
  const known = (id: unknown) => parentOf.has(id) || nodes.some((n) => n.id === id);
  lines = lines.filter((l) => known(l[0]) && known(l[1]));

  // 그룹 밖 카드의 선이 모두 층 안의 한 카드에만 닿으면(그 기술이 부르는 서비스) → 그 카드 이름 뒤 괄호
  for (const n of nodes.filter((x) => x.group === undefined)) {
    const others = new Set(lines.filter((l) => l[0] === n.id || l[1] === n.id).map((l) => (l[0] === n.id ? l[1] : l[0])));
    const [only] = others;
    const host = others.size === 1 ? nodes.find((x) => x.id === only && x.group !== undefined) : undefined;
    // 버전이 붙은 기술(예: SQLite 3.53)은 서비스가 아니라 제 카드다 — 괄호로 접지 않는다
    if (!host || (frame && /\d/.test(String(n.title ?? '')))) continue;
    const title = String(host.title ?? '');
    const service = String(n.title ?? '').trim();
    const inParens = /\(([^)]*)\)\s*$/.exec(title)?.[1]?.split(',').map((x) => x.trim().toLowerCase()) ?? [];
    // 이미 괄호에 적힌 서비스는 다시 적지 않는다. 카드 이름 한도(40자)를 넘으면 줄인다
    const named = inParens.includes(service.toLowerCase())
      ? title
      : shorten(title.endsWith(')') ? `${title.slice(0, -1)}, ${service})` : `${title} (${service})`, MAX_NODE_TITLE);
    nodes = nodes.filter((x) => x !== n).map((x) => (x === host ? { ...x, title: named } : x));
    lines = lines.filter((l) => l[0] !== n.id && l[1] !== n.id);
  }

  // 그룹 밖 카드가 한 층에서 받아 다른 한 층으로만 넘기면 → 두 층 사이 선의 라벨
  for (const n of nodes.filter((x) => x.group === undefined)) {
    const incoming = lines.filter((l) => l[1] === n.id).map((l) => layerOfEnd(l[0]));
    const outgoing = lines.filter((l) => l[0] === n.id).map((l) => layerOfEnd(l[1]));
    const from = new Set(incoming);
    const to = new Set(outgoing);
    if (from.size !== 1 || to.size !== 1) continue;
    const [a] = from;
    const [b] = to;
    if (a === b || !top.some((g) => g.id === a) || !top.some((g) => g.id === b)) continue;
    // 그 카드의 첫 선 자리에 둔다 (선 순서 = 층 순서의 실마리)
    const at = lines.findIndex((l) => l[0] === n.id || l[1] === n.id);
    const bridge: Line = [a, b, { label: shorten(String(n.title ?? ''), MAX_EDGE_LABEL) }];
    lines = lines.flatMap((l, i) => (i === at ? [bridge] : l[0] === n.id || l[1] === n.id ? [] : [l]));
    nodes = nodes.filter((x) => x !== n);
  }

  // 선 → 층 사이 선 (같은 층 안은 뺀다), 같은 두 층 사이는 하나로
  const merged: { from: unknown; to: unknown; labels: (string | undefined)[]; both: boolean }[] = [];
  for (const [from, to, meta] of lines) {
    const a = layerOfEnd(from);
    const b = layerOfEnd(to);
    if (a === b) continue;
    const same = merged.find((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a));
    if (!same) merged.push({ from: a, to: b, labels: [meta?.label], both: meta?.bidirectional === true });
    else {
      same.labels.push(meta?.label);
      if (meta?.bidirectional === true || same.from !== a) same.both = true;
    }
  }
  const edges = merged.map((m): Line => {
    const label = m.labels.every((l) => l && l.toLowerCase() === m.labels[0]!.toLowerCase()) ? m.labels[0] : undefined;
    const meta = { ...(label ? { label } : {}), ...(m.both ? { bidirectional: true } : {}) };
    return Object.keys(meta).length > 0 ? [m.from, m.to, meta] : [m.from, m.to];
  });
  return { ...spec, nodes, groups: frame ? [frame, ...top] : top, edges };
}

type Named = { id?: unknown; title?: unknown; group?: unknown; parent?: unknown };

/**
 * architecture: 없는 그룹을 가리키는 카드의 group·그룹의 parent는 지운다 (맨 바깥으로).
 * 모델이 그룹 번호 하나를 잘못 적었다고 시각화 전체가 검증에서 거절되지 않게 한다.
 */
function knownGroupsOnly(shape: unknown): unknown {
  if (typeof shape !== 'object' || shape === null) return shape;
  const spec = shape as { type?: unknown; nodes?: unknown; groups?: unknown };
  if (spec.type !== 'architecture' || !Array.isArray(spec.nodes)) return shape;
  const groups = (Array.isArray(spec.groups) ? spec.groups : []) as Named[];
  const ids = new Set(groups.map((g) => g.id));
  const known = <T extends Named>(x: T, field: 'group' | 'parent'): T => {
    if (typeof x !== 'object' || x === null || x[field] === undefined || ids.has(x[field])) return x;
    const { [field]: _unknown, ...rest } = x;
    return rest as T;
  };
  return { ...spec, nodes: (spec.nodes as Named[]).map((n) => known(n, 'group')), groups: groups.map((g) => known(g, 'parent')) };
}

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
 * - 선이 상자를 가리키고 그 상자 안의 무언가에도 선이 닿으면(= 상자가 아니라 구성요소였다): 그 상자를 열어
 *   (안의 카드·그룹은 한 단계 위로) 같은 자리에 같은 이름의 카드를 두고 선을 잇는다. 전체 시각화가 검증에서 거절되지 않는다.
 * - 안에 선이 닿는 것이 없는 상자를 가리키는 선은 층 사이(또는 카드 → 층) 선이므로 그대로 둔다 (층 구조, Task 7).
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
  // 선이 가리키는 상자 중 안의 무언가(하위 그룹 포함)에도 선이 닿는 것만 구성요소다 → 카드로 바꾼다.
  // 안에 선이 닿는 것이 없는 상자(층)는 그대로 두고 선도 상자에 잇는다 (층 사이 선, 카드 → 층)
  const parentOf = new Map<unknown, unknown>([
    ...groups.map((g): [unknown, unknown] => [g.id, g.parent]),
    ...nodes.map((n): [unknown, unknown] => [n.id, n.group]),
  ]);
  const inside = (id: unknown, group: unknown) => {
    // 깊이 제한은 잘못된 parent 순환에서 멈추기 위한 것 (순환은 parse가 거절한다)
    for (let p = parentOf.get(id), hops = 0; p && hops < 16; p = parentOf.get(p), hops++) if (p === group) return true;
    return false;
  };
  const holdsLinked = (group: unknown) => [...linked].some((id) => inside(id, group));
  // 카드가 하나도 들지 않은 상자는 그려지지 않는다 — 선이 가리키면 그것도 구성요소(카드)다
  const holdsNothing = (group: unknown) => !nodes.some((n) => inside(n.id, group));
  const pointedAt = new Set(
    edges
      .flatMap(ends)
      .filter((id) => !nodeIds.has(id) && groups.some((g) => g.id === id))
      .filter((id) => cardByName.has(key(groups.find((g) => g.id === id)!.title)) || holdsLinked(id) || holdsNothing(id)),
  );
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
const MAX_GROUP_TITLE = 40;
/** architecture 카드 이름 (그룹 이름처럼 조금 긴 이름 하나로 그림 전체가 거절되지 않게) */
const MAX_NODE_TITLE = 40;

/**
 * LLM 모양 → 저장 모양. strict JSON Schema 때문에 LLM은 모든 필드를 채워 보낸다:
 * 연결 {from, to, label, bidirectional} → [from, to] 또는 [from, to, {label?, bidirectional?}],
 * 빈 group·parent, icon 'none'은 뺀다. 유형별로 쓰지 않는 필드는 parse가 지운다.
 */
function fromLLMShape(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const spec = raw as { type?: unknown; edges?: unknown; nodes?: unknown; groups?: unknown };
  const shortTitle = (n: unknown): unknown => {
    if (spec.type !== 'architecture' || typeof n !== 'object' || n === null) return n;
    const { title } = n as { title?: unknown };
    return typeof title === 'string' ? { ...n, title: shorten(title, MAX_NODE_TITLE) } : n;
  };
  const nodes = Array.isArray(spec.nodes) ? spec.nodes.map(toNode).map(shortTitle) : undefined;
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
