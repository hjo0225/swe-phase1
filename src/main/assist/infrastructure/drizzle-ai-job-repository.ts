import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { JobType } from '../../../shared/assist/capabilities';
import type { JobFailureCode, JobStatus } from '../../../shared/ipc/assist';
import { aiJobs } from '../../platform/db/schema';
import { AIJob } from '../domain/ai-job';
import { JobOwnerGoneError, type AIJobRepository } from '../domain/ai-job-repository';
import { JobFailure } from '../domain/job-failure';
import type { JobResult, Source } from '../domain/job-result';
import { InputSnapshot } from '../domain/input-snapshot';

type Row = typeof aiJobs.$inferSelect;

export class DrizzleAIJobRepository implements AIJobRepository {
  constructor(private readonly db: BetterSQLite3Database) {}

  findById(id: string): AIJob | null {
    const row = this.db.select().from(aiJobs).where(eq(aiJobs.id, id)).get();
    return row ? toJob(row) : null;
  }

  findByNoteId(noteId: string): AIJob[] {
    return this.db.select().from(aiJobs).where(eq(aiJobs.noteId, noteId)).orderBy(desc(aiJobs.createdAt)).all().map(toJob);
  }

  findUnfinished(): AIJob[] {
    return this.db.select().from(aiJobs).where(inArray(aiJobs.status, ['QUEUED', 'RUNNING'])).all().map(toJob);
  }

  save(job: AIJob): void {
    const row = toRow(job);
    try {
      this.db.insert(aiJobs).values(row).onConflictDoUpdate({ target: aiJobs.id, set: row }).run();
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new JobOwnerGoneError(job.id);
      throw error;
    }
  }

  deleteFinishedBefore(cutoff: Date): number {
    return this.db
      .delete(aiJobs)
      .where(and(inArray(aiJobs.status, ['COMPLETED', 'FAILED']), lt(aiJobs.completedAt, cutoff.getTime())))
      .run().changes;
  }
}

function toRow(job: AIJob): Row {
  const result = job.result;
  return {
    id: job.id,
    noteId: job.noteId,
    type: job.type,
    status: job.status,
    inputText: job.input.text,
    resultKind: result?.kind ?? null,
    resultText: result && result.kind !== 'INFOGRAPHIC' ? result.markdown : null,
    resultData:
      result?.kind === 'RESEARCHED_MARKDOWN'
        ? JSON.stringify({ sources: result.sources })
        : result?.kind === 'INFOGRAPHIC'
          ? JSON.stringify({ spec: result.spec })
          : null,
    failureCode: job.failure?.code ?? null,
    failureMessage: job.failure?.message ?? null,
    provider: job.executedBy?.provider ?? null,
    model: job.executedBy?.model ?? null,
    attempt: job.attempt,
    createdAt: job.createdAt.getTime(),
    startedAt: job.startedAt?.getTime() ?? null,
    completedAt: job.completedAt?.getTime() ?? null,
  };
}

function toJob(row: Row): AIJob {
  return AIJob.restore({
    id: row.id,
    noteId: row.noteId,
    type: row.type as JobType,
    status: row.status as JobStatus,
    input: InputSnapshot.of(row.inputText),
    result: toResult(row),
    failure: row.failureCode ? JobFailure.of(row.failureCode as JobFailureCode, row.failureMessage ?? '') : undefined,
    executedBy: row.provider && row.model ? { provider: row.provider, model: row.model } : undefined,
    attempt: row.attempt,
    createdAt: new Date(row.createdAt),
    startedAt: row.startedAt === null ? undefined : new Date(row.startedAt),
    completedAt: row.completedAt === null ? undefined : new Date(row.completedAt),
  });
}

function toResult(row: Row): JobResult | undefined {
  const data = row.resultData ? (JSON.parse(row.resultData) as { sources?: Source[]; spec?: unknown }) : {};
  switch (row.resultKind) {
    case 'MARKDOWN':
      return { kind: 'MARKDOWN', markdown: row.resultText ?? '' };
    case 'RESEARCHED_MARKDOWN':
      return { kind: 'RESEARCHED_MARKDOWN', markdown: row.resultText ?? '', sources: data.sources ?? [] };
    case 'INFOGRAPHIC':
      return { kind: 'INFOGRAPHIC', spec: data.spec };
    default:
      return undefined;
  }
}
