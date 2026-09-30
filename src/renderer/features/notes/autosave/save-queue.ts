export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * 노트 하나의 자동 저장 (docs/frontend/data-flow.md 흐름 1).
 * - 마지막 편집 후 debounce 뒤에 저장한다.
 * - 저장은 직렬화된다: 저장 중 편집이 들어오면 끝난 뒤 최신 내용으로 한 번 더 저장한다.
 * - React 수명과 무관하다: 컴포넌트가 사라져도 대기 중인 저장은 끝까지 실행된다.
 */
export class SaveQueue<P> {
  private latest: (() => P) | undefined;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private listeners = new Set<() => void>();
  private currentStatus: SaveStatus = 'idle';

  constructor(
    private readonly save: (payload: P) => Promise<void>,
    private readonly options: { debounceMs: number },
  ) {}

  get status(): SaveStatus {
    return this.currentStatus;
  }

  /** 저장할 내용은 저장 시점에 getPayload()로 읽는다 (편집기 문서를 매 키 입력마다 직렬화하지 않기 위함). */
  markDirty(getPayload: () => P): void {
    this.latest = getPayload;
    this.dirty = true;
    this.setStatus('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.options.debounceMs);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inFlight) return this.inFlight.then(() => (this.dirty ? this.flush() : undefined));
    if (!this.dirty) return Promise.resolve();
    this.inFlight = this.drain().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** 대기 중인 저장을 버린다 (삭제할 노트). 진행 중인 요청은 취소하지 않는다. */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async drain(): Promise<void> {
    while (this.dirty && this.latest) {
      this.dirty = false;
      const payload = this.latest();
      this.setStatus('saving');
      try {
        await this.save(payload);
      } catch {
        this.dirty = true; // 다음 flush(편집 또는 재시도)에서 최신 내용으로 다시 저장
        this.setStatus('error');
        return;
      }
    }
    this.setStatus('saved');
  }

  private setStatus(status: SaveStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    for (const listener of this.listeners) listener();
  }
}

/** 노트별 SaveQueue 보관소. 앱 종료 시 flushAll()로 모든 대기 저장을 끝낸다. */
export class AutosaveRegistry<P> {
  private queues = new Map<string, SaveQueue<P>>();

  constructor(
    private readonly save: (noteId: string, payload: P) => Promise<void>,
    private readonly options: { debounceMs: number },
  ) {}

  get(noteId: string): SaveQueue<P> {
    let queue = this.queues.get(noteId);
    if (!queue) {
      queue = new SaveQueue((payload) => this.save(noteId, payload), this.options);
      this.queues.set(noteId, queue);
    }
    return queue;
  }

  discard(noteId: string): void {
    this.queues.get(noteId)?.cancel();
    this.queues.delete(noteId);
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.flush()));
  }
}
