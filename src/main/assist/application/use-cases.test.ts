import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProvider } from '../../ai-provider/testing';
import { createTestVaultIndex, insertIndexedNote } from '../../note/testing';
import { AIJob } from '../domain/ai-job';
import { JobFailure } from '../domain/job-failure';
import { InputSnapshot } from '../domain/input-snapshot';
import { DrizzleAIJobRepository } from '../infrastructure/drizzle-ai-job-repository';
import { allCapabilities, FakeActiveLLM } from '../testing';
import { AIJobQueries } from './ai-job-queries';
import { CreateAIJob } from './create-ai-job';
import { OrganizeExecutor } from './executors/organize-executor';
import { RecoverInterruptedJobs } from './recover-interrupted-jobs';
import { RetryAIJob } from './retry-ai-job';

const NOTE = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const DAY = 24 * 60 * 60 * 1000;

describe('assist use cases', () => {
  let database: ReturnType<typeof createTestVaultIndex>;
  let repo: DrizzleAIJobRepository;
  let active: FakeActiveLLM;
  let enqueue: ReturnType<typeof vi.fn<(id: string) => void>>;
  let now: Date;
  const clock = { now: () => now };

  beforeEach(() => {
    database = createTestVaultIndex();
    insertIndexedNote(database.sqlite, NOTE);
    repo = new DrizzleAIJobRepository(database.db);
    active = new FakeActiveLLM();
    enqueue = vi.fn<(id: string) => void>();
    now = new Date(0);
  });
  afterEach(() => database.close());

  const notes = { exists: (id: string) => id === NOTE };
  const create = () => new CreateAIJob({ repo, notes, activeLLM: active, runner: { enqueue }, clock });
  const input = { jobId: JOB, noteId: NOTE, type: 'ORGANIZE' as const, inputText: '회의했고 api 얘기함' };

  describe('CreateAIJob', () => {
    it('queues a job and hands it to the runner', () => {
      const view = create().execute(input);
      expect(view).toMatchObject({ id: JOB, status: 'QUEUED', inputText: '회의했고 api 얘기함', attempt: 1 });
      expect(enqueue).toHaveBeenCalledWith(JOB);
    });

    it('is idempotent for the same request and rejects a different one with the same id', () => {
      create().execute(input);
      expect(create().execute(input).id).toBe(JOB);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(() => create().execute({ ...input, inputText: '다른 텍스트' })).toThrow(
        expect.objectContaining({ code: 'AI_JOB_ID_CONFLICT' }),
      );
    });

    it('rejects unknown notes, missing providers and unsupported job types', () => {
      expect(() => create().execute({ ...input, noteId: JOB })).toThrow(expect.objectContaining({ code: 'NOTE_NOT_FOUND' }));
      active.configured = false;
      expect(() => create().execute(input)).toThrow(expect.objectContaining({ code: 'AI_PROVIDER_NOT_CONFIGURED' }));
      active.configured = true;
      active.capabilities = { ...allCapabilities, webSearch: false };
      expect(() => create().execute({ ...input, type: 'EXPAND' })).toThrow(
        expect.objectContaining({ code: 'AI_CAPABILITY_UNSUPPORTED' }),
      );
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('RetryAIJob', () => {
    it('requeues a failed job', () => {
      create().execute(input);
      const job = repo.findById(JOB)!;
      job.fail(JobFailure.of('TIMEOUT', ''), now);
      repo.save(job);

      const view = new RetryAIJob({ repo, activeLLM: active, runner: { enqueue }, clock }).execute({ jobId: JOB });
      expect(view).toMatchObject({ status: 'QUEUED', attempt: 2 });
      expect(enqueue).toHaveBeenLastCalledWith(JOB);
    });

    it('rejects unknown and non-failed jobs', () => {
      const retry = new RetryAIJob({ repo, activeLLM: active, runner: { enqueue }, clock });
      expect(() => retry.execute({ jobId: JOB })).toThrow(expect.objectContaining({ code: 'AI_JOB_NOT_FOUND' }));
      create().execute(input);
      expect(() => retry.execute({ jobId: JOB })).toThrow(expect.objectContaining({ code: 'AI_JOB_NOT_RETRYABLE' }));
    });
  });

  it('lists a note’s jobs and gets one', () => {
    create().execute(input);
    const queries = new AIJobQueries(repo);
    expect(queries.listByNote(NOTE).items.map((j) => j.id)).toEqual([JOB]);
    expect(queries.get(JOB).id).toBe(JOB);
    expect(() => queries.get(NOTE)).toThrow(expect.objectContaining({ code: 'AI_JOB_NOT_FOUND' }));
  });

  it('fails interrupted jobs at startup and prunes old finished ones', () => {
    const job = (id: string) =>
      AIJob.request({ id, noteId: NOTE, type: 'ORGANIZE', input: InputSnapshot.of('x'), capabilities: allCapabilities, now });
    const queued = job('queued');
    const running = job('running');
    running.start({ provider: 'openai', model: 'm' }, allCapabilities, now);
    const old = job('old');
    old.fail(JobFailure.of('TIMEOUT', ''), now);
    [queued, running, old].forEach((j) => repo.save(j));

    now = new Date(31 * DAY);
    new RecoverInterruptedJobs(repo, clock).execute();
    expect(repo.findById('queued')?.failure?.code).toBe('INTERRUPTED');
    expect(repo.findById('running')?.failure?.code).toBe('INTERRUPTED');
    expect(repo.findById('old')).toBeNull();
  });

  describe('OrganizeExecutor', () => {
    it('asks the model to restructure without adding facts and returns clean markdown', async () => {
      const generateText = vi.fn().mockResolvedValue('```markdown\n## 회의 결과\n- API 논의\n```');
      const result = await new OrganizeExecutor().execute(
        InputSnapshot.of('회의했고 api 얘기함'),
        fakeProvider({ generateText }),
        new AbortController().signal,
      );
      expect(result).toEqual({ kind: 'MARKDOWN', markdown: '## 회의 결과\n- API 논의' });
      const [{ system, user }] = generateText.mock.calls[0] as [{ system: string; user: string }];
      expect(user).toBe('회의했고 api 얘기함');
      expect(system).toContain('Do not add facts');
      expect(system).toContain('same language as the selected text');
      expect(system).toContain('## Components');
      expect(system).toContain('## Flows');
      // 원문에 없는 위치·라벨을 만들지 않는다
      expect(system).toContain('only when the text says it is there');
      expect(system).toContain('including users');
      expect(system).toContain('Do not restate the action');
    });
  });
});
