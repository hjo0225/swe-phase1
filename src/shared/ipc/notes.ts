/** note 도메인 IPC 계약 타입 — docs/backend/note/api-contract.md */

export type NoteId = string;

export type ProseMirrorDocDto = { type: 'doc'; content?: unknown[] };

export interface NoteSummary {
  id: NoteId;
  /** 표시 제목 (빈 제목이면 '제목 없음') */
  title: string;
  preview: string;
  updatedAt: string;
}

export interface NoteDetail {
  id: NoteId;
  /** 저장된 원본 제목 (빈 문자열 가능) */
  title: string;
  content: ProseMirrorDocDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title?: string;
  content?: ProseMirrorDocDto;
}

export interface UpdateNoteInput {
  id: NoteId;
  title?: string;
  content?: ProseMirrorDocDto;
}

export interface SearchNotesInput {
  query: string;
  /** 현재 노트를 결과에서 뺀다 */
  excludeNoteId?: NoteId;
  /** 1~50, 기본 20 */
  limit?: number;
}

export interface NoteSearchHit {
  id: NoteId;
  /** 표시 제목 */
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface LinkedNote {
  noteId: NoteId;
  /** 현재 표시 제목 */
  title: string;
}

export interface NoteLinks {
  outgoing: LinkedNote[];
  incoming: LinkedNote[];
}

export interface UpdateNoteResult {
  id: NoteId;
  updatedAt: string;
  changed: boolean;
}
