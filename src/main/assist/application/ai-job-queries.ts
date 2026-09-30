import type { AIJobView } from '../../../shared/ipc/assist';
import { DomainError } from '../../platform/errors';
import type { AIJobRepository } from '../domain/ai-job-repository';
import { toJobView } from './job-view';

/** UC-ASSIST-005: 노트를 열 때 Pending Mark가 가리키는 Job을 찾는다. */
export class AIJobQueries {
  constructor(private readonly repo: AIJobRepository) {}

  get(jobId: string): AIJobView {
    const job = this.repo.findById(jobId);
    if (!job) throw new DomainError('AI_JOB_NOT_FOUND', `Job ${jobId} not found`);
    return toJobView(job);
  }

  listByNote(noteId: string): { items: AIJobView[] } {
    return { items: this.repo.findByNoteId(noteId).map(toJobView) };
  }
}
