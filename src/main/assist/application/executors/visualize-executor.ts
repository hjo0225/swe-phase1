import { infographicJsonSchema, parseInfographicSpec } from '../../../../shared/visualization/infographic-spec';
import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { VISUALIZE_PROMPT } from '../prompts';

/** 시각화: Structured Output → 형식 검증 → 구조 불변식·정규화 (명세서 §15). 이미지 생성 모델은 쓰지 않는다. */
export class VisualizeExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    const raw = await llm.generateStructured({
      system: VISUALIZE_PROMPT,
      user: input.text,
      schemaName: 'infographic_spec',
      jsonSchema: infographicJsonSchema(),
      signal,
    });
    return JobResults.infographic(parseInfographicSpec(fromLLMShape(raw)));
  }
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
