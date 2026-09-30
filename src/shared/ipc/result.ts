export type CommonErrorCode = 'VALIDATION_FAILED' | 'INTERNAL_ERROR';
export type NoteErrorCode = 'NOTE_NOT_FOUND' | 'NOTE_TITLE_TOO_LONG' | 'NOTE_CONTENT_INVALID' | 'NOTE_CONTENT_TOO_LARGE';
export type AssistErrorCode =
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_CAPABILITY_UNSUPPORTED'
  | 'AI_INPUT_EMPTY'
  | 'AI_INPUT_TOO_LONG'
  | 'AI_JOB_ID_CONFLICT'
  | 'AI_JOB_NOT_FOUND'
  | 'AI_JOB_NOT_RETRYABLE';
export type ProviderErrorCode =
  | 'PROVIDER_MODEL_NOT_SUPPORTED'
  | 'PROVIDER_API_KEY_REQUIRED'
  | 'PROVIDER_SECURE_STORAGE_UNAVAILABLE'
  | 'PROVIDER_BASE_URL_INVALID';
export type ExportErrorCode = 'EXPORT_INVALID_IMAGE' | 'EXPORT_TOO_LARGE' | 'EXPORT_WRITE_FAILED';
/** 도메인이 구현될 때마다 도메인 오류 코드 union을 여기에 합친다. */
export type BlinkErrorCode = CommonErrorCode | NoteErrorCode | AssistErrorCode | ProviderErrorCode | ExportErrorCode;

export interface IpcError {
  code: BlinkErrorCode;
  message: string;
  details?: unknown;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
