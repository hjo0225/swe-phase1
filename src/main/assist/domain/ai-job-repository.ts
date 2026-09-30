import type { AIJob } from './ai-job';

/** 저장하려는 Job의 노트가 이미 삭제됨 (FK). Runner는 결과를 폐기한다. */
export class JobOwnerGoneError extends Error {
  constructor(jobId: string) {
    super(`Note of job ${jobId} no longer exists`);
    this.name = 'JobOwnerGoneError';
  }
}

/** docs/backend/assist/repositories.md */
export interface AIJobRepository {
  findById(id: string): AIJob | null;
  /** createdAt DESC */
  findByNoteId(noteId: string): AIJob[];
  /** QUEUED, RUNNING */
  findUnfinished(): AIJob[];
  /** UPSERT. 노트가 없으면 JobOwnerGoneError */
  save(job: AIJob): void;
  /** COMPLETED/FAILED 이고 completedAt < cutoff 인 Job 삭제. 삭제 수 반환 */
  deleteFinishedBefore(cutoff: Date): number;
}
