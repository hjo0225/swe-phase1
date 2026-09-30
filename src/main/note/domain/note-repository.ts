import type { Note } from './note';
import type { SearchQuery } from './search-query';

export interface NoteSummaryRow {
  id: string;
  title: string;
  /** 미리보기 계산용 plainText 앞부분 */
  plainTextHead: string;
  updatedAt: Date;
}

/** 검색 결과 읽기 모델. 스니펫은 서비스가 도메인 규칙(snippetOf)으로 만든다. */
export interface NoteSearchRow {
  id: string;
  title: string;
  plainText: string;
  updatedAt: Date;
}

/** 링크 상대 노트와 현재 제목(원본, 빈 문자열 가능). */
export interface LinkedNoteRow {
  noteId: string;
  title: string;
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
  /** 모든 키워드를 제목 또는 본문에 포함. 첫 키워드 제목 매칭 우선 → 최신순. */
  search(query: SearchQuery, options: { excludeNoteId?: string; limit: number }): NoteSearchRow[];
  findOutgoingLinks(sourceId: string): LinkedNoteRow[];
  findIncomingLinks(targetId: string): LinkedNoteRow[];
}
