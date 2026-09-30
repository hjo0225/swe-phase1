import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { ORGANIZE_PROMPT } from '../prompts';

/** 정리: 구조 분석 → 재작성. Web Search는 쓰지 않는다 (명세서 §14.2). */
export class OrganizeExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    const text = await llm.generateText({ system: ORGANIZE_PROMPT, user: input.text, signal });
    return JobResults.markdown(text);
  }
}
