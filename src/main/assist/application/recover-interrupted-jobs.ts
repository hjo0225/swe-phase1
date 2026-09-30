import type { Clock } from '../../platform/clock';
import type { AIJobRepository } from '../domain/ai-job-repository';
import { JobFailure } from '../domain/job-failure';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * UC-ASSIST-006, D-07: 앱 시작 시(IPC 등록 전) 재개하지 않는 Job을 명시적 실패로 만들고, 오래된 완료 Job을 정리한다.
 * 정리된 Job을 가리키는 Pending Mark는 노트를 열 때 제거되고 원문이 남는다.
 */
export class RecoverInterruptedJobs {
  constructor(
    private readonly repo: AIJobRepository,
    private readonly clock: Clock,
  ) {}

  execute(): void {
    const now = this.clock.now();
    for (const job of this.repo.findUnfinished()) {
      job.fail(JobFailure.of('INTERRUPTED', 'App closed before the job finished'), now);
      this.repo.save(job);
    }
    this.repo.deleteFinishedBefore(new Date(now.getTime() - RETENTION_MS));
  }
}
