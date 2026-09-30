import type { RawBlinkApi } from '../shared/ipc/blink-api';

declare global {
  interface Window {
    blink?: RawBlinkApi;
  }
}

export {};
