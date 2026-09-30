import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { EXPAND_PROMPT } from '../prompts';

/** 구체화: 조사 의도 파악 → Provider Native Web Search → 출처 수집 → 재작성 (명세서 §13.2). */
export class ExpandExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    const { text, sources } = await llm.researchAndGenerate({ system: EXPAND_PROMPT, user: input.text, signal });
    return JobResults.researched(text, sources);
  }
}
