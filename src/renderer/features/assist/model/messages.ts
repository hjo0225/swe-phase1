import type { JobType } from '../../../../shared/assist/capabilities';
import type { ConnectionFailureCode } from '../../../../shared/ipc/ai-provider';
import type { JobFailureCode } from '../../../../shared/ipc/assist';
import { BlinkIpcError } from '../../../../shared/ipc/errors';

/** 사용자 문구는 Renderer가 code로 정한다 (docs/backend/assist/api-contract.md "Job 실패 코드"). */

export const JOB_TYPE_LABEL: Record<JobType, string> = { EXPAND: 'Expand', ORGANIZE: 'Organize', VISUALIZE: 'Visualize' };

export const JOB_FAILURE_MESSAGE: Record<JobFailureCode, string> = {
  PROVIDER_NOT_CONFIGURED: 'Finish setting up AI',
  PROVIDER_AUTH_FAILED: 'Check your API key',
  PROVIDER_RATE_LIMITED: 'Try again in a moment',
  PROVIDER_UNAVAILABLE: 'Check your network or the provider status',
  TIMEOUT: 'The response took too long',
  INVALID_OUTPUT: 'Couldn\'t produce a result',
  NO_SOURCES: 'Couldn\'t find related sources',
  CAPABILITY_UNSUPPORTED: 'The current model doesn\'t support this',
  INTERRUPTED: 'Stopped because the app closed',
  UNKNOWN: 'Something went wrong',
};

export const CONNECTION_FAILURE_MESSAGE: Record<ConnectionFailureCode, string> = {
  AUTH_FAILED: 'Check your API key',
  MODEL_NOT_FOUND: 'This key can\'t use this model',
  RATE_LIMITED: 'Too many requests. Try again in a moment',
  UNAVAILABLE: 'Couldn\'t reach the provider',
  TIMEOUT: 'The response took too long',
};

/** AI 요청이 IPC 단계에서 거절됐을 때의 문구. */
export function describeRequestError(error: unknown): string {
  if (!(error instanceof BlinkIpcError)) return 'Couldn\'t start the AI job';
  switch (error.code) {
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return 'Set up AI first';
    case 'AI_CAPABILITY_UNSUPPORTED':
      return 'The current model doesn\'t support this';
    case 'AI_INPUT_EMPTY':
      return 'The selection is empty';
    case 'AI_INPUT_TOO_LONG':
      return 'Select 10,000 characters or fewer';
    case 'NOTE_NOT_FOUND':
      return 'Note not found';
    default:
      return 'Couldn\'t start the AI job';
  }
}
