import { BrowserWindow, type WebContents } from 'electron';
import { A4_PRINT, fitToOnePage } from '../../../../shared/print/page-fit';
import { PRINT_READY_ATTRIBUTE, PRINT_ROOT_ATTRIBUTE, printRoutePath } from '../../../../shared/print/print-page';
import { loadRenderer, lockNavigation, secureWebPreferences } from '../../../window';
import type { NotePdfRenderer } from '../../application/export-note-pdf';

/** 인쇄 화면이 준비 신호를 줄 때까지 기다리는 최대 시간. 인쇄 화면 자신은 15초 뒤 그대로 신호를 준다. */
const READY_TIMEOUT_MS = 30_000;

/**
 * 숨은 창에 앱 자신의 인쇄 화면(`#/print/<noteId>`)을 열어 PDF로 만든다.
 * 창은 메인 창과 같은 보안 설정(preload·contextIsolation·sandbox)을 쓰고, 끝나면(실패해도) 바로 없앤다.
 */
export class ElectronNotePdfRenderer implements NotePdfRenderer {
  async render(noteId: string): Promise<{ pdf: Uint8Array; scale: number; clipped: boolean }> {
    const window = new BrowserWindow({
      show: false,
      // 인쇄 화면은 인쇄 영역 폭으로 그린다. 창 폭은 스크롤바가 생겨도 줄바꿈이 바뀌지 않을 만큼만 넉넉히
      width: Math.ceil(A4_PRINT.printableWidthPx) + 40,
      height: 1200,
      useContentSize: true,
      backgroundColor: '#FFFFFF',
      // 숨은 창에서도 타이머·그림 decode가 늦춰지지 않게 한다
      webPreferences: { ...secureWebPreferences(), backgroundThrottling: false },
    });
    try {
      lockNavigation(window);
      await loadRenderer(window, printRoutePath(noteId));
      const contentHeight = await waitUntilReady(window.webContents, READY_TIMEOUT_MS);
      const { scale, clipped } = fitToOnePage(contentHeight);
      const margin = A4_PRINT.marginInches;
      const data = await window.webContents.printToPDF({
        pageSize: 'A4',
        landscape: false,
        printBackground: true,
        margins: { top: margin, bottom: margin, left: margin, right: margin },
        scale,
        // 늘 한 장: 최소 배율로도 넘치는 아주 긴 노트는 아래쪽이 잘린다 (clipped)
        pageRanges: '1',
        preferCSSPageSize: false,
      });
      return { pdf: new Uint8Array(data), scale, clipped };
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }
  }
}

/** 인쇄 화면의 data-print-ready를 기다렸다가 내용 높이(CSS px)를 잰다. 'error'·시간 초과는 실패. */
function waitUntilReady(contents: WebContents, timeoutMs: number): Promise<number> {
  const script = `new Promise((resolve, reject) => {
    const deadline = Date.now() + ${timeoutMs};
    const tick = () => {
      const state = document.documentElement.getAttribute(${JSON.stringify(PRINT_READY_ATTRIBUTE)});
      if (state === 'true') {
        const root = document.querySelector('[${PRINT_ROOT_ATTRIBUTE}]');
        resolve(root ? Math.ceil(root.getBoundingClientRect().height) : 0);
      } else if (state === 'error') reject(new Error('Print page could not load the note'));
      else if (Date.now() > deadline) reject(new Error('Print page was not ready in time'));
      else setTimeout(tick, 50);
    };
    tick();
  })`;
  return contents.executeJavaScript(script) as Promise<number>;
}
