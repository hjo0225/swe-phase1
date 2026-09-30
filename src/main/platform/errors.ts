import type { BlinkErrorCode } from '../../shared/ipc/result';

/** 도메인·애플리케이션이 의도적으로 거절할 때 던진다. IPC 경계에서 Envelope의 error로 바뀐다. */
export class DomainError extends Error {
  constructor(
    readonly code: BlinkErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
