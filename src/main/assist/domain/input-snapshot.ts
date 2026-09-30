import { MAX_INPUT_LENGTH } from '../../../shared/assist/capabilities';
import { DomainError } from '../../platform/errors';

/** 요청 시점의 선택 텍스트. 실행·재시도 모두 이 값만 쓴다 (BR-ASSIST-01). */
export class InputSnapshot {
  private constructor(readonly text: string) {}

  static of(text: string): InputSnapshot {
    if (text.trim().length === 0) throw new DomainError('AI_INPUT_EMPTY', 'Selected text is empty');
    if (text.length > MAX_INPUT_LENGTH) {
      throw new DomainError('AI_INPUT_TOO_LONG', `Selected text exceeds ${MAX_INPUT_LENGTH} characters`, {
        max: MAX_INPUT_LENGTH,
      });
    }
    return new InputSnapshot(text);
  }
}
