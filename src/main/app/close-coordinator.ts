import { IpcEvents } from '../../shared/ipc/channels';

export interface ClosableWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): void;
  close(): void;
  webContents: { send(channel: string, payload: unknown): void };
}

/**
 * D-12: 창을 닫기 전에 Renderer가 대기 중인 자동 저장을 끝낼 기회를 준다.
 * 첫 close는 막고 `app:will-close`를 보낸 뒤, release() 또는 타임아웃이 오면 실제로 닫는다.
 */
export function createCloseCoordinator(window: ClosableWindow, options: { timeoutMs: number }) {
  let allowClose = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const closeNow = () => {
    if (allowClose) return;
    allowClose = true;
    clearTimeout(timer);
    window.close();
  };

  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (timer) return; // 이미 응답을 기다리는 중
    window.webContents.send(IpcEvents.appWillClose, {});
    timer = setTimeout(closeNow, options.timeoutMs);
  });

  return {
    /** Renderer가 flush를 끝냈다고 알릴 때 호출한다. 대기 중인 close가 없으면 무시한다. */
    release() {
      if (timer) closeNow();
    },
  };
}
