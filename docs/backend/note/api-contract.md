# Note Domain — API Contract (IPC)

공통 규칙: [04-api-conventions.md](../../04-api-conventions.md). 모든 응답은 `IpcResult<T>`. 보관함이 열려 있지 않으면 노트·폴더 채널은 `VAULT_NOT_OPEN`.

## 타입

```ts
type NoteId = string;            // UUID (색인이 부여)

interface VaultInfo { root: string; name: string }

interface NoteSummary {
  id: NoteId;
  title: string;                 // 파일 이름(.md 제외)
  path: string;                  // 보관함 기준 경로 (프로젝트/회의록.md)
  folder: string;                // '' = 맨 위
  preview: string;
  updatedAt: string;
}

interface NoteDetail {
  id: NoteId;
  title: string;
  path: string;
  content: string;               // Markdown
  createdAt: string;
  updatedAt: string;
}

interface VaultTree { folders: string[]; notes: NoteSummary[] }   // 폴더 경로는 '/' 구분
```

## 보관함

| 채널 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `vault:get-current` | `{}` | `VaultInfo \| null` | — |
| `vault:choose` | `{}` | `VaultInfo \| null` (Dialog 취소 = null) | `VAULT_NOT_ACCESSIBLE` |
| `vault:open` | `{ root }` | `VaultInfo` | `VAULT_NOT_FOUND`, `VAULT_NOT_ACCESSIBLE` |
| `vault:list-recent` | `{}` | `{ items: (VaultInfo & { exists: boolean })[] }` | — |

## 노트

| 채널 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `note:tree` | `{}` | `VaultTree` | — |
| `note:create` | `{ folder?: string }` | `NoteDetail` | `FOLDER_NOT_FOUND` |
| `note:get` | `{ id }` | `NoteDetail` | `NOTE_NOT_FOUND` |
| `note:update` | `{ id, content: string }` | `{ id, updatedAt, changed }` | `NOTE_NOT_FOUND`, `NOTE_CONTENT_TOO_LARGE`, `NOTE_WRITE_FAILED` |
| `note:rename` | `{ id, title }` | `{ note: NoteSummary; updatedNoteIds: NoteId[] }` (링크를 고친 다른 노트) | `NOTE_TITLE_INVALID`, `NOTE_TITLE_TAKEN`, `NOTE_NOT_FOUND` |
| `note:move` | `{ id, folder }` | `{ note: NoteSummary; updatedNoteIds: NoteId[] }` | `NOTE_TITLE_TAKEN`, `FOLDER_NOT_FOUND`, `NOTE_NOT_FOUND` |
| `note:delete` | `{ id }` | `{ deleted: true }` | — |
| `note:search` | 이전과 같음 | `{ items: NoteSearchHit[] }` (+ `path`) | — |
| `note-link:list` | `{ noteId }` | `{ outgoing, incoming }` | `NOTE_NOT_FOUND` |

## 폴더

| 채널 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `folder:create` | `{ parent?: string; name }` | `{ path }` | `FOLDER_NAME_INVALID`, `FOLDER_NAME_TAKEN`, `FOLDER_NOT_FOUND` |
| `folder:rename` | `{ path; name }` | `{ path; updatedNoteIds }` | `FOLDER_NAME_INVALID`, `FOLDER_NAME_TAKEN`, `FOLDER_NOT_FOUND` |
| `folder:delete` | `{ path }` | `{ deletedNotes: number }` | `FOLDER_NOT_FOUND` |

## 푸시 이벤트

| 이벤트 | Payload | 시점 |
| --- | --- | --- |
| `vault:changed` | `{ noteIds: NoteId[]; structure: boolean }` | 외부 변경·링크 고치기로 노트가 바뀌었을 때. `structure`는 노트·폴더가 생기거나 없어졌는지 |

## 오류 코드

`VAULT_NOT_OPEN`, `VAULT_NOT_FOUND`, `VAULT_NOT_ACCESSIBLE`, `NOTE_NOT_FOUND`, `NOTE_TITLE_INVALID`, `NOTE_TITLE_TAKEN`, `NOTE_CONTENT_TOO_LARGE`, `NOTE_WRITE_FAILED`, `FOLDER_NAME_INVALID`, `FOLDER_NAME_TAKEN`, `FOLDER_NOT_FOUND`.

## Renderer 본문 스키마 계약

```ts
{ type: 'noteLink', attrs: { target: string; label: string } }   // Markdown: [[target]] 또는 [[target|label]]
```
