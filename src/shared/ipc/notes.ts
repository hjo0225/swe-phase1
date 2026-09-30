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

export interface UpdateNoteResult {
  id: NoteId;
  updatedAt: string;
  changed: boolean;
}
