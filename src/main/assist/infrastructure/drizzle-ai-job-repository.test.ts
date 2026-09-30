import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestVaultIndex, insertIndexedNote } from '../../note/testing';
import { AIJob } from '../domain/ai-job';
import { JobOwnerGoneError } from '../domain/ai-job-repository';
import { JobFailure } from '../domain/job-failure';
import { JobResults } from '../domain/job-result';
import { InputSnapshot } from '../domain/input-snapshot';
import { allCapabilities } from '../testing';
import { DrizzleAIJobRepository } from './drizzle-ai-job-repository';

const NOTE = '11111111-1111-4111-8111-111111111111';
const t = (s: number) => new Date(s * 1000);

describe('DrizzleAIJobRepository', () => {
  let database: ReturnType<typeof createTestVaultIndex>;
  let repo: DrizzleAIJobRepository;

  beforeEach(() => {
    database = createTestVaultIndex();
    insertIndexedNote(database.sqlite, NOTE);
    repo = new DrizzleAIJobRepository(database.db);
  });
  afterEach(() => database.close());

  const newJob = (id: string, type: 'ORGANIZE' | 'EXPAND' | 'VISUALIZE' = 'ORGANIZE', at = 0) =>
    AIJob.request({ id, noteId: NOTE, type, input: InputSnapshot.of('입력'), capabilities: allCapabilities, now: t(at) });

  it('round-trips every result kind and failure', () => {
    const organize = newJob('a');
    organize.start({ provider: 'openai', model: 'm' }, allCapabilities, t(1));
    organize.complete(JobResults.markdown('## 결과'), t(2));
    const expand = newJob('b', 'EXPAND');
    expand.start({ provider: 'openai', model: 'm' }, allCapabilities, t(1));
    expand.complete(JobResults.researched('본문', [{ title: 'T', url: 'https://a.dev/' }]), t(2));
    const visualize = newJob('c', 'VISUALIZE');
    visualize.start({ provider: 'openai', model: 'm' }, allCapabilities, t(1));
    visualize.complete(JobResults.infographic({ type: 'process' }), t(2));
    const failed = newJob('d');
    failed.fail(JobFailure.of('TIMEOUT', 'slow'), t(3));

    for (const job of [organize, expand, visualize, failed]) repo.save(job);

    expect(repo.findById('a')?.result).toEqual({ kind: 'MARKDOWN', markdown: '## 결과' });
    expect(repo.findById('b')?.result).toEqual(expand.result);
    expect(repo.findById('c')?.result).toEqual({ kind: 'INFOGRAPHIC', spec: { type: 'process' } });
    expect(repo.findById('d')?.failure).toMatchObject({ code: 'TIMEOUT', message: 'slow', retryable: true });
    expect(repo.findById('a')).toMatchObject({ status: 'COMPLETED', attempt: 1, executedBy: { provider: 'openai', model: 'm' } });
    expect(repo.findById('zzz')).toBeNull();
  });

  it('lists a note’s jobs newest first and finds unfinished ones', () => {
    repo.save(newJob('old', 'ORGANIZE', 1));
    const running = newJob('new', 'ORGANIZE', 2);
    running.start({ provider: 'openai', model: 'm' }, allCapabilities, t(3));
    repo.save(running);
    expect(repo.findByNoteId(NOTE).map((j) => j.id)).toEqual(['new', 'old']);
    expect(repo.findUnfinished().map((j) => j.id).sort()).toEqual(['new', 'old']);
  });

  it('deletes finished jobs older than a cutoff', () => {
    const old = newJob('old');
    old.fail(JobFailure.of('TIMEOUT', ''), t(10));
    const recent = newJob('recent');
    recent.fail(JobFailure.of('TIMEOUT', ''), t(100));
    repo.save(old);
    repo.save(recent);
    repo.save(newJob('queued'));
    expect(repo.deleteFinishedBefore(t(50))).toBe(1);
    expect(repo.findById('old')).toBeNull();
    expect(repo.findById('queued')).not.toBeNull();
  });

  it('disappears with its note and refuses to save once the note is gone', () => {
    const job = newJob('a');
    repo.save(job);
    database.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(NOTE);
    expect(repo.findById('a')).toBeNull();
    expect(() => repo.save(job)).toThrow(JobOwnerGoneError);
  });
});
