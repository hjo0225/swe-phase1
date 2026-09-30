import type { IpcResult } from './result';

export interface AppInfo {
  version: string;
}

/** Renderer 코드가 쓰는 API. 실패하면 BlinkIpcError를 throw 한다. */
export interface BlinkApi {
  app: { getInfo(): Promise<AppInfo> };
}

type RawMethod<F> = F extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<IpcResult<R>> : F;

/**
 * Preload가 window.blink로 노출하는 API.
 * contextBridge는 Error의 커스텀 속성(code)을 복사하지 않으므로 Envelope를 그대로 넘기고,
 * Renderer 쪽 클라이언트가 unwrap 한다.
 */
export type RawBlinkApi = { [N in keyof BlinkApi]: { [M in keyof BlinkApi[N]]: RawMethod<BlinkApi[N][M]> } };
