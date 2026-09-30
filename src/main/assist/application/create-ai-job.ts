import type { AIJobView, CreateJobInput } from '../../../shared/ipc/assist';
import type { Clock } from '../../platform/clock';
import { DomainError } from '../../platform/errors';
import { AIJob } from '../domain/ai-job';
import type { AIJobRepository } from '../domain/ai-job-repository';
import { InputSnapshot } from '../domain/input-snapshot';
import { toJobView } from './job-view';
import type { ActiveLLMPort, NoteExistence } from './ports';

interface Deps {
  repo: AIJobRepository;
  notes: NoteExistence;
  activeLLM: ActiveLLMPort;
  runner: { enqueue(jobId: string): void };
  clock: Clock;
}

/** UC-ASSIST-001. Job ID는 Renderer가 만든다(D-10) — 같은 ID·같은 요청의 재전송은 멱등. */
export class CreateAIJob {
  constructor(private readonly deps: Deps) {}

  execute(input: CreateJobInput): AIJobView {
    const { repo, notes, activeLLM, runner, clock } = this.deps;

    const existing = repo.findById(input.jobId);
    if (existing) {
      if (existing.isSameRequest(input.noteId, input.type, input.inputText)) return toJobView(existing);
      throw new DomainError('AI_JOB_ID_CONFLICT', `Job ${input.jobId} already exists with different content`);
    }
    if (!notes.exists(input.noteId)) throw new DomainError('NOTE_NOT_FOUND', `Note ${input.noteId} not found`);

    const active = activeLLM.resolve();
    const job = AIJob.request({
      id: input.jobId,
      noteId: input.noteId,
      type: input.type,
      input: InputSnapshot.of(input.inputText),
      capabilities: active.capabilities.toJSON(),
      now: clock.now(),
    });
    repo.save(job);
    runner.enqueue(job.id);
    return toJobView(job);
  }
}
