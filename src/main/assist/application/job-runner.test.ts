import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../ai-provider/application/ports';
import { createTestDatabase } from '../../note/testing';
import { AIJob } from '../domain/ai-job';
import { JobOutputError, JobResults, type JobResult } from '../domain/job-result';
import { InputSnapshot } from '../domain/input-snapshot';
import { DrizzleAIJobRepository } from '../infrastructure/drizzle-ai-job-repository';
import { allCapabilities, deferred, FakeActiveLLM, RecordingPublisher } from '../testing';
import { JobRunner } from './job-runner';
import type { JobExecutor } from './ports';

const NOTE = '11111111-1111-4111-8111-111111111111';

describe('JobRunner', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let repo: DrizzleAIJobRepository;
  let active: FakeActiveLLM;
  let publisher: RecordingPublisher;
  let execute: ReturnType<typeof vi.fn<JobExecutor['execute']>>;
  let runner: JobRunner;

  beforeEach(() => {
    database = createTestDatabase();
    database.sqlite
      .prepare("INSERT INTO notes (id, title, content_json, plain_text, created_at, updated_at) VALUES (?, '', '{}', '', 0, 0)")
      .run(NOTE);
    repo = new DrizzleAIJobRepository(database.db);
    active = new FakeActiveLLM();
    publisher = new RecordingPublisher();
    execute = vi.fn<JobExecutor['execute']>().mockResolvedValue(JobResults.markdown('## 결과'));
    runner = new JobRunner({
      repo,
      activeLLM: active,
      executors: { ORGANIZE: { execute } },
      publisher,
      clock: { now: () => new Date(0) },
      logger: { error: () => undefined },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    database.close();
  });

  const queue = (id: string, type: 'ORGANIZE' | 'EXPAND' = 'ORGANIZE') => {
    repo.save(
      AIJob.request({ id, noteId: NOTE, type, input: InputSnapshot.of(`입력 ${id}`), capabilities: allCapabilities, now: new Date(0) }),
    );
    runner.enqueue(id);
  };

  it('runs a queued job and publishes RUNNING then COMPLETED', async () => {
    queue('a');
    await runner.whenIdle();
    expect(publisher.statuses('a')).toEqual(['RUNNING', 'COMPLETED']);
    expect(repo.findById('a')).toMatchObject({ status: 'COMPLETED', executedBy: { provider: 'openai', model: 'test-model' } });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ text: '입력 a' }), active.client, expect.any(AbortSignal));
  });

  it('runs at most two jobs at once, first in first out', async () => {
    const gates = [deferred<JobResult>(), deferred<JobResult>(), deferred<JobResult>()];
    execute.mockImplementation(() => gates[execute.mock.calls.length - 1]!.promise);
    queue('a');
    queue('b');
    queue('c');
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(repo.findById('c')?.status).toBe('QUEUED');

    gates[0]!.resolve(JobResults.markdown('a'));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    gates[1]!.resolve(JobResults.markdown('b'));
    gates[2]!.resolve(JobResults.markdown('c'));
    await runner.whenIdle();
    expect(['a', 'b', 'c'].map((id) => repo.findById(id)?.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
  });

  it.each([
    [new ProviderError('AUTH', '401'), 'PROVIDER_AUTH_FAILED'],
    [new ProviderError('RATE_LIMIT', '429'), 'PROVIDER_RATE_LIMITED'],
    [new ProviderError('BAD_RESPONSE', 'x'), 'INVALID_OUTPUT'],
    [new JobOutputError('NO_SOURCES', 'none'), 'NO_SOURCES'],
    [new Error('boom'), 'UNKNOWN'],
  ])('maps %s to FAILED(%s)', async (error, code) => {
    execute.mockRejectedValue(error);
    queue('a');
    await runner.whenIdle();
    expect(repo.findById('a')?.failure?.code).toBe(code);
    expect(publisher.statuses('a')).toEqual(['RUNNING', 'FAILED']);
  });

  it('fails with TIMEOUT when the executor exceeds the time limit', async () => {
    vi.useFakeTimers();
    execute.mockImplementation(() => new Promise(() => undefined));
    queue('a');
    await vi.advanceTimersByTimeAsync(60_000);
    await runner.whenIdle();
    expect(repo.findById('a')?.failure?.code).toBe('TIMEOUT');
  });

  it('fails before starting when no provider or capability is available', async () => {
    active.configured = false;
    queue('a');
    await runner.whenIdle();
    expect(repo.findById('a')?.failure?.code).toBe('PROVIDER_NOT_CONFIGURED');

    active.configured = true;
    active.capabilities = { generate: true, structuredOutput: true, webSearch: false };
    runner = new JobRunner({
      repo,
      activeLLM: active,
      executors: { EXPAND: { execute } },
      publisher,
      clock: { now: () => new Date(0) },
      logger: { error: () => undefined },
    });
    queue('b', 'EXPAND');
    await runner.whenIdle();
    expect(repo.findById('b')?.failure?.code).toBe('CAPABILITY_UNSUPPORTED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('discards the result when the note was deleted while running', async () => {
    const gate = deferred<JobResult>();
    execute.mockReturnValue(gate.promise);
    queue('a');
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    database.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(NOTE);
    gate.resolve(JobResults.markdown('late'));
    await runner.whenIdle();
    expect(repo.findById('a')).toBeNull();
    expect(publisher.statuses('a')).toEqual(['RUNNING']);
  });
});
