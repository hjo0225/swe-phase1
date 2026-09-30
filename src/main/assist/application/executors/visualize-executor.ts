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

/** LLM 스키마는 연결을 {from, to} 객체로 받는다(strict JSON Schema 제약) → 저장 형식 [from, to]로 바꾼다. */
function fromLLMShape(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const edges = (raw as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return raw;
  return {
    ...raw,
    edges: edges.map((e: unknown) =>
      typeof e === 'object' && e !== null && 'from' in e && 'to' in e ? [(e as { from: unknown }).from, (e as { to: unknown }).to] : e,
    ),
  };
}
