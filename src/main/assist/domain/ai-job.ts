import { JOB_CAPABILITY_REQUIREMENTS, type Capabilities, type JobType } from '../../../shared/assist/capabilities';
import type { JobStatus } from '../../../shared/ipc/assist';
import { DomainError } from '../../platform/errors';
import type { InputSnapshot } from './input-snapshot';
import type { JobFailure } from './job-failure';
import { RESULT_KIND_OF, type JobResult } from './job-result';

export interface ExecutedBy {
  provider: string;
  model: string;
}

export interface AIJobProps {
  id: string;
  noteId: string;
  type: JobType;
  status: JobStatus;
  input: InputSnapshot;
  result?: JobResult;
  failure?: JobFailure;
  executedBy?: ExecutedBy;
  attempt: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/** 허용되지 않은 상태 전이. 사용자 입력이 아니라 프로그래밍 오류다. */
export class IllegalJobTransition extends Error {
  constructor(action: string, status: JobStatus) {
    super(`Cannot ${action} a ${status} job`);
    this.name = 'IllegalJobTransition';
  }
}

/** timeoutMs는 작업의 성질이다 (BR-ASSIST-07). */
export const JOB_TIMEOUT_MS: Record<JobType, number> = { ORGANIZE: 60_000, VISUALIZE: 60_000, EXPAND: 120_000 };

/**
 * AI 변환 1건 (docs/backend/assist/domain-model.md).
 * COMPLETED이면 항상 유형에 맞는 검증된 결과가 있다 — Renderer가 안심하고 적용할 수 있는 근거다.
 */
export class AIJob {
  private constructor(private props: AIJobProps) {}

  static request(input: {
    id: string;
    noteId: string;
    type: JobType;
    input: InputSnapshot;
    capabilities: Capabilities;
    now: Date;
  }): AIJob {
    requireCapabilities(input.type, input.capabilities);
    return new AIJob({
      id: input.id,
      noteId: input.noteId,
      type: input.type,
      status: 'QUEUED',
      input: input.input,
      attempt: 1,
      createdAt: input.now,
    });
  }

  static restore(props: AIJobProps): AIJob {
    return new AIJob({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get noteId() {
    return this.props.noteId;
  }
  get type() {
    return this.props.type;
  }
  get status() {
    return this.props.status;
  }
  get input() {
    return this.props.input;
  }
  get result() {
    return this.props.result;
  }
  get failure() {
    return this.props.failure;
  }
  get executedBy() {
    return this.props.executedBy;
  }
  get attempt() {
    return this.props.attempt;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get startedAt() {
    return this.props.startedAt;
  }
  get completedAt() {
    return this.props.completedAt;
  }

  start(executedBy: ExecutedBy, capabilities: Capabilities, now: Date): void {
    if (this.props.status !== 'QUEUED') throw new IllegalJobTransition('start', this.props.status);
    requireCapabilities(this.props.type, capabilities);
    this.props = { ...this.props, status: 'RUNNING', executedBy, startedAt: now };
  }

  complete(result: JobResult, now: Date): void {
    if (this.props.status !== 'RUNNING') throw new IllegalJobTransition('complete', this.props.status);
    if (result.kind !== RESULT_KIND_OF[this.props.type]) {
      throw new IllegalJobTransition(`complete with ${result.kind}`, this.props.status);
    }
    this.props = { ...this.props, status: 'COMPLETED', result, completedAt: now };
  }

  fail(failure: JobFailure, now: Date): void {
    if (this.props.status !== 'QUEUED' && this.props.status !== 'RUNNING') {
      throw new IllegalJobTransition('fail', this.props.status);
    }
    this.props = { ...this.props, status: 'FAILED', failure, completedAt: now };
  }

  /** BR-ASSIST-05: 같은 ID·같은 Input Snapshot으로 다시 대기열에 넣는다. */
  retry(capabilities: Capabilities): void {
    if (this.props.status !== 'FAILED') {
      throw new DomainError('AI_JOB_NOT_RETRYABLE', `Job ${this.props.id} is ${this.props.status}`);
    }
    requireCapabilities(this.props.type, capabilities);
    this.props = {
      id: this.props.id,
      noteId: this.props.noteId,
      type: this.props.type,
      input: this.props.input,
      createdAt: this.props.createdAt,
      status: 'QUEUED',
      attempt: this.props.attempt + 1,
    };
  }

  isSameRequest(noteId: string, type: JobType, inputText: string): boolean {
    return this.props.noteId === noteId && this.props.type === type && this.props.input.text === inputText;
  }
}

function requireCapabilities(type: JobType, capabilities: Capabilities): void {
  const missing = JOB_CAPABILITY_REQUIREMENTS[type].filter((c) => !capabilities[c]);
  if (missing.length > 0) {
    throw new DomainError('AI_CAPABILITY_UNSUPPORTED', `The active model cannot run ${type}`, { missing });
  }
}
