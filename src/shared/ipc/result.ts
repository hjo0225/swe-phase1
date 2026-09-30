export type CommonErrorCode = 'VALIDATION_FAILED' | 'INTERNAL_ERROR';
export type NoteErrorCode = 'NOTE_NOT_FOUND' | 'NOTE_TITLE_TOO_LONG' | 'NOTE_CONTENT_INVALID' | 'NOTE_CONTENT_TOO_LARGE';
/** 도메인이 구현될 때마다 도메인 오류 코드 union을 여기에 합친다. */
export type BlinkErrorCode = CommonErrorCode | NoteErrorCode;

export interface IpcError {
  code: BlinkErrorCode;
  message: string;
  details?: unknown;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
