import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../../../shared/assist/capabilities';
import { AIJob, IllegalJobTransition } from './ai-job';
import { JobFailure } from './job-failure';
import { JobOutputError, JobResults } from './job-result';
import { InputSnapshot } from './input-snapshot';

const all: Capabilities = { generate: true, structuredOutput: true, webSearch: true };
const textOnly: Capabilities = { generate: true, structuredOutput: false, webSearch: false };
const t = (s: number) => new Date(s * 1000);
const NOTE = '11111111-1111-4111-8111-111111111111';

const request = (type: 'ORGANIZE' | 'EXPAND' | 'VISUALIZE' = 'ORGANIZE', capabilities = all) =>
  AIJob.request({ id: 'job-1', noteId: NOTE, type, input: InputSnapshot.of('회의했고 api 얘기함'), capabilities, now: t(0) });

describe('InputSnapshot', () => {
  it('rejects blank input and input over 10,000 characters', () => {
    expect(() => InputSnapshot.of('  \n ')).toThrow(expect.objectContaining({ code: 'AI_INPUT_EMPTY' }));
    expect(() => InputSnapshot.of('a'.repeat(10_001))).toThrow(expect.objectContaining({ code: 'AI_INPUT_TOO_LONG' }));
    expect(InputSnapshot.of(' 그대로 ').text).toBe(' 그대로 ');
  });
});

describe('JobResults', () => {
  it('strips a wrapping markdown code fence', () => {
    expect(JobResults.markdown('```markdown\n## 제목\n- 항목\n```').markdown).toBe('## 제목\n- 항목');
    expect(JobResults.markdown('## 그대로').markdown).toBe('## 그대로');
  });

  it('rejects empty or oversized markdown', () => {
    expect(() => JobResults.markdown('  ')).toThrow(JobOutputError);
    expect(() => JobResults.markdown('a'.repeat(20_001))).toThrow(expect.objectContaining({ code: 'INVALID_OUTPUT' }));
  });

  it('normalizes sources and appends them to the committed markdown', () => {
    const result = JobResults.researched('본문', [
      { title: 'Electron', url: 'https://www.electronjs.org/' },
      { title: 'dup', url: 'https://www.electronjs.org/' },
      { title: 'bad', url: 'javascript:alert(1)' },
      { title: '', url: 'https://nodejs.org/' },
      ...Array.from({ length: 5 }, (_, i) => ({ title: `x${i}`, url: `https://x${i}.dev/` })),
    ]);
    expect(result.kind).toBe('RESEARCHED_MARKDOWN');
    if (result.kind !== 'RESEARCHED_MARKDOWN') return;
    expect(result.sources.map((s) => s.url)).toEqual([
      'https://www.electronjs.org/',
      'https://nodejs.org/',
      'https://x0.dev/',
      'https://x1.dev/',
      'https://x2.dev/',
    ]);
    expect(result.markdown).toBe(
      '본문\n\n**출처**\n- [Electron](https://www.electronjs.org/)\n- [https://nodejs.org/](https://nodejs.org/)\n- [x0](https://x0.dev/)\n- [x1](https://x1.dev/)\n- [x2](https://x2.dev/)',
    );
  });

  it('fails with NO_SOURCES when research returns no usable source', () => {
    expect(() => JobResults.researched('본문', [{ title: 'x', url: 'ftp://nope' }])).toThrow(
      expect.objectContaining({ code: 'NO_SOURCES' }),
    );
  });
});

describe('AIJob', () => {
  it('is requested as QUEUED only when the model supports the job type', () => {
    expect(request().status).toBe('QUEUED');
    expect(() => request('EXPAND', textOnly)).toThrow(
      expect.objectContaining({ code: 'AI_CAPABILITY_UNSUPPORTED', details: { missing: ['webSearch'] } }),
    );
  });

  it('runs QUEUED → RUNNING → COMPLETED with a result matching its type', () => {
    const job = request();
    job.start({ provider: 'openai', model: 'm' }, all, t(1));
    expect(job.status).toBe('RUNNING');
    expect(job.startedAt).toEqual(t(1));

    expect(() => job.complete(JobResults.researched('x', [{ title: 't', url: 'https://a.dev' }]), t(2))).toThrow(
      IllegalJobTransition,
    );
    job.complete(JobResults.markdown('## 결과'), t(2));
    expect(job.status).toBe('COMPLETED');
    expect(job.result).toEqual({ kind: 'MARKDOWN', markdown: '## 결과' });
    expect(job.completedAt).toEqual(t(2));
  });

  it('can fail from QUEUED or RUNNING, but not after completion', () => {
    const queued = request();
    queued.fail(JobFailure.of('INTERRUPTED', 'app closed'), t(1));
    expect(queued.status).toBe('FAILED');
    expect(queued.failure).toMatchObject({ code: 'INTERRUPTED', retryable: true });

    const done = request();
    done.start({ provider: 'openai', model: 'm' }, all, t(1));
    done.complete(JobResults.markdown('x'), t(2));
    expect(() => done.fail(JobFailure.of('TIMEOUT', ''), t(3))).toThrow(IllegalJobTransition);
  });

  it('retries only from FAILED, bumping the attempt and clearing the failure', () => {
    const job = request();
    expect(() => job.retry(all)).toThrow(expect.objectContaining({ code: 'AI_JOB_NOT_RETRYABLE' }));

    job.start({ provider: 'openai', model: 'm' }, all, t(1));
    job.fail(JobFailure.of('TIMEOUT', 'slow'), t(2));
    job.retry(all);
    expect(job.status).toBe('QUEUED');
    expect(job.attempt).toBe(2);
    expect(job.failure).toBeUndefined();
    expect(job.startedAt).toBeUndefined();
    expect(job.completedAt).toBeUndefined();
  });

  it('rechecks capabilities when starting and retrying', () => {
    const job = request('EXPAND');
    expect(() => job.start({ provider: 'openai', model: 'm' }, textOnly, t(1))).toThrow(
      expect.objectContaining({ code: 'AI_CAPABILITY_UNSUPPORTED' }),
    );
    job.fail(JobFailure.of('CAPABILITY_UNSUPPORTED', ''), t(1));
    expect(() => job.retry(textOnly)).toThrow(expect.objectContaining({ code: 'AI_CAPABILITY_UNSUPPORTED' }));
  });

  it('recognizes an identical re-request for idempotency', () => {
    const job = request();
    expect(job.isSameRequest(NOTE, 'ORGANIZE', '회의했고 api 얘기함')).toBe(true);
    expect(job.isSameRequest(NOTE, 'EXPAND', '회의했고 api 얘기함')).toBe(false);
  });

  it('marks failure codes as retryable or not', () => {
    expect(JobFailure.of('PROVIDER_AUTH_FAILED', '').retryable).toBe(false);
    expect(JobFailure.of('PROVIDER_RATE_LIMITED', '').retryable).toBe(true);
  });
});
