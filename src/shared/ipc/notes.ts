/** note 도메인 IPC 계약 타입 — docs/backend/note/api-contract.md (보관함 방식, D-14) */

export type NoteId = string;

export interface VaultInfo {
  root: string;
  /** 폴더 이름 */
  name: string;
}

export interface NoteSummary {
  id: NoteId;
  /** 파일 이름(.md 제외) = 제목 */
  title: string;
  /** 보관함 기준 경로 (프로젝트/회의록.md) */
  path: string;
  /** '' = 맨 위 */
  folder: string;
  preview: string;
  updatedAt: string;
}

export interface NoteDetail {
  id: NoteId;
  title: string;
  path: string;
  /** Markdown */
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultTree {
  /** 보관함 기준 폴더 경로, `/` 구분 */
  folders: string[];
  notes: NoteSummary[];
}

export interface CreateNoteInput {
  folder?: string;
}

export interface UpdateNoteInput {
  id: NoteId;
  content: string;
}

export interface UpdateNoteResult {
  id: NoteId;
  updatedAt: string;
  changed: boolean;
}

/** 이름 변경·이동 결과. updatedNoteIds = 링크를 고친 다른 노트 */
export interface RelocateNoteResult {
  note: NoteSummary;
  updatedNoteIds: NoteId[];
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
  title: string;
  path: string;
  snippet: string;
  updatedAt: string;
}

export interface LinkedNote {
  noteId: NoteId;
  title: string;
}

export interface NoteLinks {
  outgoing: LinkedNote[];
  incoming: LinkedNote[];
}

/**
 * 한 장짜리 A4 PDF 내보내기 결과. Dialog를 취소하면 { saved: false }.
 * scale: 한 장에 맞추려고 줄인 배율(1 = 그대로), clipped: 최소 배율로도 넘쳐 아래쪽이 잘림
 */
export type ExportPdfResult = { saved: true; filePath: string; scale: number; clipped: boolean } | { saved: false };

/** Main → Renderer: 외부 변경·링크 고치기로 노트가 바뀜 */
export interface VaultChangedEvent {
  noteIds: NoteId[];
  /** 노트·폴더가 생기거나 없어졌는지 */
  structure: boolean;
}
