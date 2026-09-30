import type { BlinkErrorCode } from '../../../shared/ipc/result';
import { DomainError } from '../../platform/errors';

const MAX_LENGTH = 200;
/** Windows·macOS·Linux 어디서나 파일 이름에 쓸 수 없는 문자 */
const FORBIDDEN = /[\\/:*?"<>|]/;

function validName(raw: string, code: BlinkErrorCode, kind: string): string {
  const value = raw.trim();
  if (!value || value.length > MAX_LENGTH || FORBIDDEN.test(value) || value.startsWith('.') || value.endsWith('.')) {
    throw new DomainError(code, `Invalid ${kind} name: ${raw}`, { maxLength: MAX_LENGTH });
  }
  return value;
}

/** 노트 이름 = 제목 = 파일 이름(.md 제외) (D-16, BR-NOTE-01). */
export class NoteName {
  private constructor(readonly value: string) {}

  static of(raw: string): NoteName {
    return new NoteName(validName(raw, 'NOTE_TITLE_INVALID', 'note'));
  }
}

/** BR-FOLDER-01: 노트 이름과 같은 규칙. */
export class FolderName {
  private constructor(readonly value: string) {}

  static of(raw: string): FolderName {
    return new FolderName(validName(raw, 'FOLDER_NAME_INVALID', 'folder'));
  }
}

/** `기본`, 겹치면 `기본 1`, `기본 2`… (대소문자 무시 — 파일 시스템 대부분이 대소문자를 구분하지 않는다) */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 1; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
