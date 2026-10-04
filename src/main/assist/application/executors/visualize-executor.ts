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
  return {
    ...raw,
    ...(Array.isArray(spec.edges) ? { edges: spec.edges.map(toEdge) } : {}),
    ...(Array.isArray(spec.nodes) ? { nodes: spec.nodes.map(toNode) } : {}),
    ...(Array.isArray(spec.groups) ? { groups: spec.groups.map(toGroup) } : {}),
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
