import type { BlinkErrorCode, IpcResult } from './result';

/** Renderer에서 IPC 실패를 표현한다. code로 UI 동작을 결정한다. */
export class BlinkIpcError extends Error {
  constructor(
    readonly code: BlinkErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BlinkIpcError';
  }
}

export function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw new BlinkIpcError(result.error.code, result.error.message, result.error.details);
}
