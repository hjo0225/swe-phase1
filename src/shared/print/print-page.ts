/**
 * 인쇄 화면(Renderer `#/print/<noteId>`)과 Main(숨은 인쇄 창 → printToPDF) 사이의 약속.
 *
 * - 인쇄 화면은 노트를 다 그리고 기다릴 것을 모두 기다린 뒤 `<html data-print-ready="true">`를 단다.
 *   노트를 읽지 못하면 `"error"`를 단다. Main은 이 값만 보고 인쇄하거나 실패로 끝낸다.
 * - 기다리는 것: 노트 불러오기, 편집기 생성, 모든 `<img>` decode(깨진 그림은 건너뜀), `document.fonts.ready`,
 *   그리고 `data-print-busy` 속성이 붙은 요소가 하나도 남지 않을 때까지.
 * - 비동기로 배치하는 요소(예: 레이아웃을 나중에 계산하는 인포그래픽)는 배치하는 동안 자기 요소에
 *   `data-print-busy`를 달고, 끝나면 지운다(요소를 없애도 된다). 그 밖의 약속은 없다.
 * - Main은 `[data-print-root]` 요소의 높이를 재어 한 장에 맞출 배율을 정한다.
 */
export const PRINT_READY_ATTRIBUTE = 'data-print-ready';
export const PRINT_BUSY_ATTRIBUTE = 'data-print-busy';
export const PRINT_ROOT_ATTRIBUTE = 'data-print-root';

export type PrintReadyState = 'true' | 'error';

/** 인쇄 화면 주소 (hash 라우터 경로) */
export const printRoutePath = (noteId: string) => `/print/${encodeURIComponent(noteId)}`;
