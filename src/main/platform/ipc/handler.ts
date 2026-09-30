import type { ZodType } from 'zod';
import type { IpcResult } from '../../../shared/ipc/result';
import { DomainError } from '../errors';

export interface ErrorLogger {
  error(...args: unknown[]): void;
}

/**
 * 전송 검증(Zod) → 유스케이스 실행 → Result Envelope.
 * 핸들러는 예외를 던지지 않는다 (docs/04-api-conventions.md).
 */
export function createIpcHandler<I, O>(
  schema: ZodType<I>,
  run: (input: I) => O | Promise<O>,
  logger: ErrorLogger = console,
): (raw: unknown) => Promise<IpcResult<O>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request',
          details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      };
    }
    try {
      return { ok: true, data: await run(parsed.data) };
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        };
      }
      // ORM·SDK 예외 메시지는 Renderer로 내보내지 않는다.
      logger.error(error);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } };
    }
  };
}
