import type { JobFailureCode } from '../../../shared/ipc/assist';

const NOT_RETRYABLE: ReadonlySet<JobFailureCode> = new Set([
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_AUTH_FAILED',
  'CAPABILITY_UNSUPPORTED',
]);

/**
 * 실패 코드와 진단 메시지. message에는 API Key·원문을 넣지 않는다.
 * retryable은 UI 힌트일 뿐, 재시도 자체는 모든 FAILED에서 허용한다(설정을 고친 뒤 재시도할 수 있으므로).
 */
export class JobFailure {
  private constructor(
    readonly code: JobFailureCode,
    readonly message: string,
  ) {}

  static of(code: JobFailureCode, message: string): JobFailure {
    return new JobFailure(code, message);
  }

  get retryable(): boolean {
    return !NOT_RETRYABLE.has(this.code);
  }
}
