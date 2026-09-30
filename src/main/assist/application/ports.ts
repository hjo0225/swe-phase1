import type { AIJobView } from '../../../shared/ipc/assist';
import type { ActiveModel } from '../../ai-provider/application/active-llm';
import type { LLMProvider } from '../../ai-provider/application/ports';
import type { InputSnapshot } from '../domain/input-snapshot';
import type { JobResult } from '../domain/job-result';

/** 유형별 파이프라인: 프롬프트 구성 → Provider 호출 → 원시 응답을 검증된 JobResult로. 상태 전이·저장은 하지 않는다. */
export interface JobExecutor {
  execute(input: InputSnapshot, llm: LLMProvider, signal: AbortSignal): Promise<JobResult>;
}

/** Job 상태가 바뀔 때 Renderer로 알린다. 이벤트는 최적화이고 정합성의 근거가 아니다(노트를 열 때 목록으로 복구). */
export interface JobEventPublisher {
  jobUpdated(view: AIJobView): void;
}

/** ai-provider 공개 API 중 assist가 쓰는 부분. */
export interface ActiveLLMPort {
  resolve(): ActiveModel;
  tryResolve(): ActiveModel | null;
}

/** note 공개 API 중 assist가 쓰는 부분. */
export interface NoteExistence {
  exists(noteId: string): boolean;
}
