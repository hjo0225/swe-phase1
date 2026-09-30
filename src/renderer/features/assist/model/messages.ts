import type { JobType } from '../../../../shared/assist/capabilities';
import type { ConnectionFailureCode } from '../../../../shared/ipc/ai-provider';
import type { JobFailureCode } from '../../../../shared/ipc/assist';
import { BlinkIpcError } from '../../../../shared/ipc/errors';

/** 사용자 문구는 Renderer가 code로 정한다 (docs/backend/assist/api-contract.md "Job 실패 코드"). */

export const JOB_TYPE_LABEL: Record<JobType, string> = { EXPAND: '구체화', ORGANIZE: '정리', VISUALIZE: '시각화' };

export const JOB_FAILURE_MESSAGE: Record<JobFailureCode, string> = {
  PROVIDER_NOT_CONFIGURED: 'AI 설정을 완료하세요',
  PROVIDER_AUTH_FAILED: 'API Key를 확인하세요',
  PROVIDER_RATE_LIMITED: '잠시 후 다시 시도하세요',
  PROVIDER_UNAVAILABLE: '네트워크 또는 Provider 상태를 확인하세요',
  TIMEOUT: '응답이 너무 오래 걸렸습니다',
  INVALID_OUTPUT: '결과를 만들지 못했습니다',
  NO_SOURCES: '관련 자료를 찾지 못했습니다',
  CAPABILITY_UNSUPPORTED: '현재 모델은 이 기능을 지원하지 않습니다',
  INTERRUPTED: '앱 종료로 중단되었습니다',
  UNKNOWN: '알 수 없는 오류가 발생했습니다',
};

export const CONNECTION_FAILURE_MESSAGE: Record<ConnectionFailureCode, string> = {
  AUTH_FAILED: 'API Key를 확인하세요',
  MODEL_NOT_FOUND: '이 Key로 사용할 수 없는 모델입니다',
  RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도하세요',
  UNAVAILABLE: 'Provider에 연결하지 못했습니다',
  TIMEOUT: '응답이 너무 오래 걸렸습니다',
};

/** AI 요청이 IPC 단계에서 거절됐을 때의 문구. */
export function describeRequestError(error: unknown): string {
  if (!(error instanceof BlinkIpcError)) return 'AI 작업을 시작하지 못했습니다';
  switch (error.code) {
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return 'AI 설정을 먼저 완료하세요';
    case 'AI_CAPABILITY_UNSUPPORTED':
      return '현재 모델은 이 기능을 지원하지 않습니다';
    case 'AI_INPUT_EMPTY':
      return '선택한 텍스트가 비어 있습니다';
    case 'AI_INPUT_TOO_LONG':
      return '10,000자 이하로 선택하세요';
    case 'NOTE_NOT_FOUND':
      return '노트를 찾을 수 없습니다';
    default:
      return 'AI 작업을 시작하지 못했습니다';
  }
}
