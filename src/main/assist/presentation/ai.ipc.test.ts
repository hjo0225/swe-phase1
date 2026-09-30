import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../../note/testing';
import { AIJobQueries } from '../application/ai-job-queries';
import { CreateAIJob } from '../application/create-ai-job';
import { RetryAIJob } from '../application/retry-ai-job';
import { DrizzleAIJobRepository } from '../infrastructure/drizzle-ai-job-repository';
import { FakeActiveLLM } from '../testing';
import { aiIpcHandlers } from './ai.ipc';

const NOTE = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';

describe('aiIpcHandlers', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let handlers: ReturnType<typeof aiIpcHandlers>;

  beforeEach(() => {
    database = createTestDatabase();
    database.sqlite
      .prepare("INSERT INTO notes (id, title, content_json, plain_text, created_at, updated_at) VALUES (?, '', '{}', '', 0, 0)")
      .run(NOTE);
    const repo = new DrizzleAIJobRepository(database.db);
    const deps = { repo, activeLLM: new FakeActiveLLM(), runner: { enqueue: vi.fn() }, clock: { now: () => new Date(0) } };
    handlers = aiIpcHandlers({
      create: new CreateAIJob({ ...deps, notes: { exists: (id) => id === NOTE } }),
      retry: new RetryAIJob(deps),
      queries: new AIJobQueries(repo),
    });
  });
  afterEach(() => database.close());

  const call = (channel: string, request: unknown) => handlers[channel]!(request);

  it('exposes the ai channels', () => {
    expect(Object.keys(handlers).sort()).toEqual(['ai:create-job', 'ai:get-job', 'ai:list-jobs', 'ai:retry-job']);
  });

  it('creates, gets and lists jobs', async () => {
    await expect(
      call('ai:create-job', { jobId: JOB, noteId: NOTE, type: 'ORGANIZE', inputText: '메모' }),
    ).resolves.toMatchObject({ ok: true, data: { id: JOB, status: 'QUEUED' } });
    await expect(call('ai:get-job', { jobId: JOB })).resolves.toMatchObject({ ok: true, data: { id: JOB } });
    await expect(call('ai:list-jobs', { noteId: NOTE })).resolves.toMatchObject({ ok: true, data: { items: [{ id: JOB }] } });
  });

  it('validates transport shape and maps domain errors', async () => {
    await expect(call('ai:create-job', { jobId: 'x', noteId: NOTE, type: 'ORGANIZE', inputText: 'a' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('ai:create-job', { jobId: JOB, noteId: NOTE, type: 'TRANSLATE', inputText: 'a' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('ai:create-job', { jobId: JOB, noteId: NOTE, type: 'ORGANIZE', inputText: '  ' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_INPUT_EMPTY' },
    });
    await expect(call('ai:retry-job', { jobId: JOB })).resolves.toMatchObject({ ok: false, error: { code: 'AI_JOB_NOT_FOUND' } });
  });
});
