import { formatRelativeTime } from '../../../shared/lib/relative-time';

/** 한국어 기준 분당 읽는 글자 수 (대략값) */
const CHARACTERS_PER_MINUTE = 500;

/** 본문 글자 수. 공백은 세고 줄바꿈은 세지 않는다. */
export function countCharacters(text: string): number {
  return text.replace(/\r?\n/g, '').length;
}

/** 읽는 데 걸리는 시간(분). 글이 있으면 최소 1분. */
export function readingMinutes(characters: number): number {
  return characters === 0 ? 0 : Math.max(1, Math.ceil(characters / CHARACTERS_PER_MINUTE));
}

/** 제목 아래 정보 줄: `2분 전 수정 · 1,240자 · 약 3분` (본문이 비면 수정 시각만). */
export function formatNoteStats(input: { updatedAt: string; characters: number }, now: Date = new Date()): string {
  const parts = [`${formatRelativeTime(input.updatedAt, now).replace(/^방금 전$/, '방금')} 수정`];
  if (input.characters > 0) {
    parts.push(`${input.characters.toLocaleString('ko-KR')}자`, `약 ${readingMinutes(input.characters)}분`);
  }
  return parts.join(' · ');
}
