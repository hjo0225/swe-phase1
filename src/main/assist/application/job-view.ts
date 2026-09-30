import type { AIJobView } from '../../../shared/ipc/assist';
import type { AIJob } from '../domain/ai-job';

/** IPC 표현. failure.message(진단용)는 내보내지 않는다. */
export function toJobView(job: AIJob): AIJobView {
  return {
    id: job.id,
    noteId: job.noteId,
    type: job.type,
    status: job.status,
    inputText: job.input.text,
    attempt: job.attempt,
    ...(job.result ? { result: job.result } : {}),
    ...(job.failure ? { failure: { code: job.failure.code, retryable: job.failure.retryable } } : {}),
    createdAt: job.createdAt.toISOString(),
    ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
  };
}
