import type { BlinkApi, RawBlinkApi } from '../../../shared/ipc/blink-api';
import { unwrap } from '../../../shared/ipc/errors';
import type { IpcResult } from '../../../shared/ipc/result';
import { createMockBlink, type MockBlinkOptions } from '../../mocks/createMockBlink';

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

/** Envelope를 반환하는 Raw API를 "성공은 data, 실패는 BlinkIpcError" API로 바꾼다. */
export function wrapRawApi(raw: RawBlinkApi): BlinkApi {
  const wrapped: Record<string, Record<string, unknown>> = {};
  for (const [namespace, methods] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    const target: Record<string, unknown> = {};
    for (const [name, method] of Object.entries(methods)) {
      if (typeof method !== 'function') continue;
      target[name] = (...args: unknown[]) => {
        const result: unknown = method(...args);
        // 이벤트 구독처럼 Promise가 아닌 값(unsubscribe 함수)은 그대로 돌려준다.
        return isThenable(result) ? Promise.resolve(result).then((r) => unwrap(r as IpcResult<unknown>)) : result;
      };
    }
    wrapped[namespace] = target;
  }
  return wrapped as unknown as BlinkApi;
}

let client: BlinkApi | undefined;
let mockOptions: MockBlinkOptions = {};

export function getBlink(): BlinkApi {
  client ??= wrapRawApi(window.blink ?? createMockBlink(mockOptions));
  return client;
}

/** 테스트마다 새 Mock을 쓴다. options는 다음 getBlink()가 만드는 Mock에 적용된다. */
export function resetBlinkForTests(options: MockBlinkOptions = {}): void {
  client = undefined;
  mockOptions = options;
}
