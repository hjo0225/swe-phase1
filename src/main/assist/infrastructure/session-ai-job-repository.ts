import type { AIJob } from '../domain/ai-job';
import type { AIJobRepository } from '../domain/ai-job-repository';

/**
 * AI Job은 노트와 같은 보관함 색인 DB에 있다 (D-17). 호출 시점에 열린 보관함의 저장소로 넘긴다.
 * 보관함을 바꾼 뒤 끝난 옛 Job은 새 DB에 노트가 없어 JobOwnerGoneError로 폐기된다.
 */
export class SessionAIJobRepository implements AIJobRepository {
  constructor(private readonly current: () => AIJobRepository) {}

  findById(id: string): AIJob | null {
    return this.current().findById(id);
  }
  findByNoteId(noteId: string): AIJob[] {
    return this.current().findByNoteId(noteId);
  }
  findUnfinished(): AIJob[] {
    return this.current().findUnfinished();
  }
  save(job: AIJob): void {
    this.current().save(job);
  }
  deleteFinishedBefore(cutoff: Date): number {
    return this.current().deleteFinishedBefore(cutoff);
  }
}
