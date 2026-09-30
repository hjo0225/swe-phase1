import type { Note } from './note';

export interface NoteSummaryRow {
  id: string;
  title: string;
  /** 미리보기 계산용 plainText 앞부분 */
  plainTextHead: string;
  updatedAt: Date;
}

/** docs/backend/note/repositories.md — better-sqlite3가 동기식이므로 동기 계약. */
export interface NoteRepository {
  findById(id: string): Note | null;
  exists(id: string): boolean;
  findExistingIds(ids: ReadonlySet<string>): Set<string>;
  /** 노트 행 UPSERT + 이 노트가 출발점인 링크 전체 교체, 단일 트랜잭션. */
  save(note: Note): void;
  /** 없으면 no-op. 링크·AI Job은 FK cascade. */
  delete(id: string): void;
  listSummaries(): NoteSummaryRow[];
}
