/** organize 도메인 IPC 계약 타입 — 소웨공/Phase1_파일분류_계획서.md */
import type { NoteId } from './notes';

export interface PlannedNote {
  id: NoteId;
  title: string;
  /** 지금 폴더 ('' = 맨 위) */
  from: string;
}

/** 분류하기 미리보기. 이대로 organize:apply에 넘기면 옮긴다. */
export interface OrganizePlan {
  /** 분류를 누른 폴더 ('' = 보관함 맨 위) */
  folder: string;
  /** 새로 만들 하위 폴더 (AI가 지은 이름)와 그리로 갈 노트 */
  newFolders: { name: string; notes: PlannedNote[] }[];
  /** 이미 있는 폴더(또는 「미분류」)로 갈 노트 */
  moves: (PlannedNote & { to: string })[];
  /** 옮길 것이 하나도 없을 때 그 이유 */
  skipped: 'TOO_FEW_NOTES' | 'NO_CLEAR_GROUPS' | null;
}

export interface OrganizeApplyResult {
  movedNotes: number;
  createdFolders: string[];
  /** 링크가 고쳐진 다른 노트 */
  updatedNoteIds: NoteId[];
}

export interface PlaceNoteResult {
  /** 노트가 최종적으로 들어간 폴더 */
  folder: string;
  updatedNoteIds: NoteId[];
}

export interface ImportNoteResult {
  noteId: NoteId;
  folder: string;
  updatedNoteIds: NoteId[];
}
