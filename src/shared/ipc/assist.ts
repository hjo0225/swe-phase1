import type { JobType } from '../assist/capabilities';
import type { NoteId } from './notes';

/** assist IPC 계약 — docs/backend/assist/api-contract.md */

export type JobId = string;
export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type JobFailureCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_OUTPUT'
  | 'NO_SOURCES'
  | 'CAPABILITY_UNSUPPORTED'
  | 'INTERRUPTED'
  | 'UNKNOWN';

export interface SourceDto {
  title: string;
  url: string;
}

export type JobResultDto =
  | { kind: 'MARKDOWN'; markdown: string }
  | { kind: 'RESEARCHED_MARKDOWN'; markdown: string; sources: SourceDto[] }
  | { kind: 'INFOGRAPHIC'; spec: unknown };

export interface AIJobView {
  id: JobId;
  noteId: NoteId;
  type: JobType;
  status: JobStatus;
  /** 적용 전 비교용 (BR-ASSIST-08) */
  inputText: string;
  attempt: number;
  /** status === 'COMPLETED'일 때만 */
  result?: JobResultDto;
  /** status === 'FAILED'일 때만 */
  failure?: { code: JobFailureCode; retryable: boolean };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateJobInput {
  jobId: JobId;
  noteId: NoteId;
  type: JobType;
  inputText: string;
}
