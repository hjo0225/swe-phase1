import type { RawBlinkApi } from '../../shared/ipc/blink-api';

/** 백엔드 없이 Renderer를 띄우기 위한 in-memory 구현. 실제 Preload와 같은 Envelope를 반환한다. */
export function createMockBlink(): RawBlinkApi {
  return {
    app: { getInfo: async () => ({ ok: true, data: { version: 'mock' } }) },
  };
}
