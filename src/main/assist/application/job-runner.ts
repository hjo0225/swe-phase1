import { JOB_CAPABILITY_REQUIREMENTS, type JobType } from '../../../shared/assist/capabilities';
import type { Clock } from '../../platform/clock';
import type { ErrorLogger } from '../../platform/ipc/handler';
import { runWithTimeout } from '../../platform/timeout';
import { JOB_TIMEOUT_MS, type AIJob } from '../domain/ai-job';
import { JobOwnerGoneError, type AIJobRepository } from '../domain/ai-job-repository';
import { JobFailure } from '../domain/job-failure';
import { toJobFailure } from './failure-mapper';
import { toJobView } from './job-view';
import type { ActiveLLMPort, JobEventPublisher, JobExecutor } from './ports';

interface JobRunnerDeps {
  repo: AIJobRepository;
  activeLLM: ActiveLLMPort;
  executors: Partial<Record<JobType, JobExecutor>>;
  publisher: JobEventPublisher;
  clock: Clock;
  logger?: ErrorLogger;
}

const MAX_CONCURRENCY = 2;

/**
 * UC-ASSIST-002. 큐(FIFO) + 동시 실행 상한 + 제한 시간.
 * LLM 호출 동안에는 어떤 트랜잭션도 열지 않는다: start 저장 → (호출) → 재조회 → complete/fail 저장.
 */
export class JobRunner {
  private readonly queue: string[] = [];
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly deps: JobRunnerDeps) {}

  enqueue(jobId: string): void {
    this.queue.push(jobId);
    this.pump();
  }

  /** 대기·실행 중인 Job이 모두 끝나면 resolve (테스트·종료 처리용). */
  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private isIdle(): boolean {
    return this.running === 0 && this.queue.length === 0;
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENCY && this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      this.running += 1;
      void this.run(jobId)
        .catch((error: unknown) => this.deps.logger?.error(error))
        .finally(() => {
          this.running -= 1;
          this.pump();
          if (this.isIdle()) this.idleWaiters.splice(0).forEach((resolve) => resolve());
        });
    }
  }

  private async run(jobId: string): Promise<void> {
    const { repo, activeLLM, executors, clock } = this.deps;
    const job = repo.findById(jobId);
    if (!job || job.status !== 'QUEUED') return;

    // 요청 후 설정이 지워졌거나 바뀌었을 수 있다.
    const active = activeLLM.tryResolve();
    if (!active) return this.finish(job, JobFailure.of('PROVIDER_NOT_CONFIGURED', 'No active provider'));
    const capabilities = active.capabilities.toJSON();
    const missing = JOB_CAPABILITY_REQUIREMENTS[job.type].filter((c) => !capabilities[c]);
    if (missing.length > 0) return this.finish(job, JobFailure.of('CAPABILITY_UNSUPPORTED', missing.join(',')));

    job.start({ provider: active.provider, model: active.model }, capabilities, clock.now());
    if (!this.persist(job)) return;

    let settle: (current: AIJob) => void;
    try {
      const executor = executors[job.type];
      if (!executor) throw new Error(`No executor for ${job.type}`);
      const result = await runWithTimeout(
        (signal) => executor.execute(job.input, active.client, signal),
        JOB_TIMEOUT_MS[job.type],
      );
      settle = (current) => current.complete(result, clock.now());
    } catch (error) {
      const { failure, unexpected } = toJobFailure(error);
      if (unexpected) this.deps.logger?.error(error);
      settle = (current) => current.fail(failure, clock.now());
    }

    // 긴 호출 동안 노트(와 Job)가 삭제됐을 수 있다 → 메모리의 오래된 객체가 아니라 다시 읽은 것에 적용한다.
    const current = repo.findById(jobId);
    if (!current) return;
    settle(current);
    this.persist(current);
  }

  private finish(job: AIJob, failure: JobFailure): void {
    job.fail(failure, this.deps.clock.now());
    this.persist(job);
  }

  /** 저장 후 발행. 노트가 사라졌으면 조용히 폐기한다. */
  private persist(job: AIJob): boolean {
    try {
      this.deps.repo.save(job);
    } catch (error) {
      if (error instanceof JobOwnerGoneError) return false;
      throw error;
    }
    this.deps.publisher.jobUpdated(toJobView(job));
    return true;
  }
}
