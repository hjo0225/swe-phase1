import type { JobFailureCode } from '../../../shared/ipc/assist';
import { ProviderError, type ProviderErrorKind } from '../../ai-provider/application/ports';
import { TimeoutError } from '../../platform/timeout';
import { JobFailure } from '../domain/job-failure';
import { JobOutputError } from '../domain/job-result';

const BY_PROVIDER_KIND: Record<ProviderErrorKind, JobFailureCode> = {
  AUTH: 'PROVIDER_AUTH_FAILED',
  RATE_LIMIT: 'PROVIDER_RATE_LIMITED',
  UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MODEL_NOT_FOUND: 'PROVIDER_UNAVAILABLE',
  BAD_RESPONSE: 'INVALID_OUTPUT',
  UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
};

/** 실행 중 예외 → JobFailure. 알 수 없는 예외는 이름만 남긴다(메시지에 원문이 섞일 수 있음). */
export function toJobFailure(error: unknown): { failure: JobFailure; unexpected: boolean } {
  if (error instanceof ProviderError) return { failure: JobFailure.of(BY_PROVIDER_KIND[error.kind], error.message), unexpected: false };
  if (error instanceof TimeoutError) return { failure: JobFailure.of('TIMEOUT', error.message), unexpected: false };
  if (error instanceof JobOutputError) return { failure: JobFailure.of(error.code, error.message), unexpected: false };
  if (error instanceof Error && error.name === 'InfographicSpecError') {
    return { failure: JobFailure.of('INVALID_OUTPUT', error.message), unexpected: false };
  }
  const name = error instanceof Error ? error.name : typeof error;
  return { failure: JobFailure.of('UNKNOWN', name), unexpected: true };
}
