# Note Domain — API Contract (IPC)

공통 규칙: [04-api-conventions.md](../04-api-conventions.md). 모든 응답은 `IpcResult<T>`.

## 타입

```ts
type NoteId = string;              // UUID
type ProseMirrorDoc = { type: 'doc'; content?: unknown[] };

type NoteSummary = {
  id: NoteId;
  title: string;                   // 표시 제목 (빈 제목이면 '제목 없음')
  preview: string;                 // 최대 120자
  updatedAt: string;               // ISO
};

type NoteDetail = {
  id: NoteId;
  title: string;                   // 저장된 원본 제목 (빈 문자열 가능)
  content: ProseMirrorDoc;
  createdAt: string;
  updatedAt: string;
};

type NoteSearchHit = {
  id: NoteId;
  title: string;                   // 표시 제목
  snippet: string;
  updatedAt: string;
};

type LinkedNote = { noteId: NoteId; title: string };
```

## 채널

| 채널 | Preload | 요청 | 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `note:create` | `notes.create` | `{ title?: string; content?: ProseMirrorDoc }` | `NoteDetail` | `NOTE_TITLE_TOO_LONG`, `NOTE_CONTENT_INVALID`, `NOTE_CONTENT_TOO_LARGE` |
| `note:list` | `notes.list` | `{}` | `{ items: NoteSummary[] }` | — |
| `note:get` | `notes.get` | `{ id: NoteId }` | `NoteDetail` | `NOTE_NOT_FOUND` |
| `note:update` | `notes.update` | `{ id: NoteId; title?: string; content?: ProseMirrorDoc }` (둘 중 하나 이상) | `{ id: NoteId; updatedAt: string; changed: boolean }` | `NOTE_NOT_FOUND`, `NOTE_TITLE_TOO_LONG`, `NOTE_CONTENT_INVALID`, `NOTE_CONTENT_TOO_LARGE` |
| `note:delete` | `notes.delete` | `{ id: NoteId }` | `{ deleted: true }` | — (없는 노트도 성공) |
| `note:search` | `notes.search` | `{ query: string; excludeNoteId?: NoteId; limit?: number /* 1~50, 기본 20 */ }` | `{ items: NoteSearchHit[] }` | — |
| `note-link:list` | `notes.listLinks` | `{ noteId: NoteId }` | `{ outgoing: LinkedNote[]; incoming: LinkedNote[] }` | `NOTE_NOT_FOUND` |

## 오류 코드

| code | 발생 |
| --- | --- |
| `NOTE_NOT_FOUND` | 대상 노트 없음 |
| `NOTE_TITLE_TOO_LONG` | 제목 200자 초과 |
| `NOTE_CONTENT_INVALID` | 루트가 `doc`이 아님 |
| `NOTE_CONTENT_TOO_LARGE` | 본문 직렬화 2 MB 초과 |

## 명세서 §32 대비 변경

| 명세서 | 설계 | 이유 |
| --- | --- | --- |
| `note:get-preview` | 삭제 | 검색 결과 `snippet` + `note:get`으로 충분 (D-09) |
| `note-link:create`, `note-link:delete` | 삭제 | 링크는 본문에서 파생 (D-02) |
| `notes.insertContent()` (§33) | 백엔드 채널 없음 | Renderer 편집기 동작 + `note:update` |

## Renderer 본문 스키마 계약

note 도메인이 해석하는 노드 속성. Renderer 편집기 확장은 이 이름을 지켜야 한다.

```ts
// Inline atom node
{ type: 'noteLink', attrs: { noteId: NoteId; label: string } }
```
