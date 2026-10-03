/**
 * Blink가 직접 짓는 이름. 보관함 파일 이름이 되므로 Main과 Renderer가 같이 쓴다.
 * 화면을 영어로 바꾸기 전에는 한국어로 지었다 — 이미 있는 보관함의 그 이름도 같은 뜻으로 알아본다.
 */

/** 새 노트의 파일 이름 (겹치면 `Untitled 2`) */
export const NEW_NOTE_TITLE = 'Untitled';
/** AI 분류에서 어디에도 안 맞는 노트가 가는 폴더 (층마다 하나) */
export const UNSORTED_FOLDER = 'Unsorted';

const LEGACY_NEW_NOTE_TITLE = '제목 없음';
const LEGACY_UNSORTED_FOLDER = '미분류';
const PLACEHOLDER = new RegExp(`^(${NEW_NOTE_TITLE}|${LEGACY_NEW_NOTE_TITLE})( \\d+)?$`);

/** 아직 사용자가 제목을 붙이지 않은 노트인가 */
export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER.test(title);
}

/** AI 분류의 «남는 노트» 폴더인가 */
export function isUnsortedFolder(name: string): boolean {
  return name === UNSORTED_FOLDER || name === LEGACY_UNSORTED_FOLDER;
}
