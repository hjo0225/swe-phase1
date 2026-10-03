import { DomainError } from '../../platform/errors';

/**
 * AI 분류 작업(미리보기·옮기기·자동 배치·가져오기)이 도는 동안 보관함 구조를 바꾸지 못하게 하는 잠금.
 * 분류는 그 순간의 노트·폴더 목록으로 계획을 세우므로, 그사이 구조가 바뀌면 계획이 어긋난다.
 * 한 번에 하나의 분류 작업만 돈다. 노트 본문 저장은 막지 않는다.
 */
export class OrganizeLock {
  private running = false;

  get busy(): boolean {
    return this.running;
  }

  /** 다른 분류 작업이 돌고 있으면 VAULT_BUSY */
  async run<T>(task: () => Promise<T>): Promise<T> {
    this.assertIdle();
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }

  /** 보관함 구조를 바꾸는 요청 앞에서 부른다. */
  assertIdle(): void {
    if (this.running) throw new DomainError('VAULT_BUSY', 'AI is organizing the vault');
  }
}
