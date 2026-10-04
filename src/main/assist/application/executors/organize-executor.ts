import type { LLMProvider } from '../../../ai-provider/application/ports';
import type { InputSnapshot } from '../../domain/input-snapshot';
import { JobResults, type JobResult } from '../../domain/job-result';
import type { JobExecutor } from '../ports';
import { organizePrompt } from '../prompts';
import { isTechStackText } from './tech-stack';

/** 정리: 구조 분석 → 재작성. Web Search는 쓰지 않는다 (명세서 §14.2). */
export class OrganizeExecutor implements JobExecutor {
  async execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult> {
    // 기술 이름에 버전을 붙여 쌓은 글이면 층 규칙을 덧붙인다 (Task 7)
    const text = await llm.generateText({ system: organizePrompt(isTechStackText(input.text)), user: input.text, signal });
    return JobResults.markdown(text);
  }
}
