import type { AIJobView } from '../../../shared/ipc/assist';
import type { Clock } from '../../platform/clock';
import { DomainError } from '../../platform/errors';
import type { AIJobRepository } from '../domain/ai-job-repository';
import { toJobView } from './job-view';
import type { ActiveLLMPort, JobEventPublisher } from './ports';

interface Deps {
  repo: AIJobRepository;
  activeLLM: ActiveLLMPort;
  runner: { enqueue(jobId: string): void };
  clock: Clock;
  publisher?: JobEventPublisher;
}

/** UC-ASSIST-004. 범위 텍스트가 스냅샷과 같은지는 Renderer가 호출 전에 확인한다. */
export class RetryAIJob {
  constructor(private readonly deps: Deps) {}

  execute({ jobId }: { jobId: string }): AIJobView {
    const { repo, activeLLM, runner, publisher } = this.deps;
    const job = repo.findById(jobId);
    if (!job) throw new DomainError('AI_JOB_NOT_FOUND', `Job ${jobId} not found`);
    const active = activeLLM.resolve();
    job.retry(active.capabilities.toJSON());
    repo.save(job);
    const view = toJobView(job);
    publisher?.jobUpdated(view);
    runner.enqueue(job.id);
    return view;
  }
}
