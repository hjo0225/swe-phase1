import { DomainError } from '../../platform/errors';

const MAX_LENGTH = 200;

/** BR-NOTE-01: 앞뒤 공백 제거, 최대 200자, 빈 제목 허용. */
export class NoteTitle {
  private constructor(readonly value: string) {}

  static of(raw: string): NoteTitle {
    const value = raw.trim();
    if (value.length > MAX_LENGTH) {
      throw new DomainError('NOTE_TITLE_TOO_LONG', `Title exceeds ${MAX_LENGTH} characters`, { max: MAX_LENGTH });
    }
    return new NoteTitle(value);
  }

  display(): string {
    return this.value || '제목 없음';
  }

  equals(other: NoteTitle): boolean {
    return this.value === other.value;
  }
}
