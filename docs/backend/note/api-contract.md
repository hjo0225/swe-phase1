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
| `note:export-pdf` | `{ id, options? }` | `{ saved: true; filePath; scale; clipped } \| { saved: false }` | `NOTE_NOT_FOUND`, `EXPORT_RENDER_FAILED`, `EXPORT_WRITE_FAILED` |

### PDF 내보내기 (`note:export-pdf`)

- 노트 머리줄의 Export PDF는 먼저 **내보내기 창**을 연다: 왼쪽은 종이 미리보기(인쇄 화면과 같은 `PrintDocument`를 같은 `fitToPageWidth`로 재어 같은 배율로 그림 — iframe이 아니다, iframe은 preload API를 받지 못한다), 오른쪽은 설정, 아래는 요약(`1 page · A4 portrait · 82%`)과 Cancel·Export. Export → 이 IPC → Save Dialog. 저장 창을 닫으면 내보내기 창은 그대로 남는다.
- `options` (`src/shared/print/pdf-options.ts`, 없으면 기본): `pageSize` `A4`·`A3`·`Letter`, `orientation` `portrait`·`landscape`, `margin` `default`(12 mm)·`small`(6 mm)·`none`, `includeTitle?`(없으면 자동: 본문이 맨 위 제목으로 시작하지 않을 때만), `fitToOnePage`(끄면 배율 1로 모든 장). 모르는 값·다른 필드는 `VALIDATION_FAILED`. 인쇄 화면은 같은 값을 주소 쿼리로 받는다 (`#/print/<id>?size=A4&orientation=portrait&margin=default&fit=1&title=0`).

- Renderer는 노트 ID만 보낸다. Main이 Save Dialog(기본: 다운로드 폴더, `<제목>.pdf`, PDF 필터)를 띄우고 **고른 경로에만** 쓴다. 취소는 오류가 아니라 `{ saved: false }`. Renderer는 보내기 전에 대기 중인 자동 저장을 끝낸다 — Main은 파일에서 노트를 다시 읽어 그린다.
- Main은 숨은 창(메인 창과 같은 preload·contextIsolation·sandbox, 같은 이동 차단)에 앱 자신의 인쇄 화면 `#/print/<noteId>?설정`을 열고, 준비 신호를 기다려 `printToPDF`로 만든 뒤 창을 없앤다(실패해도). 인쇄 화면은 제목 + 읽기 전용 본문만 그린다(사이드바·머리줄·도구막대 없음). `includeTitle`이 없을 때, 본문이 이미 맨 위 제목(`# …` 또는 Setext `===`)으로 시작하면 노트 제목은 찍지 않는다(제목 중복 방지).
- **준비 신호 약속** (`src/shared/print/print-page.ts`): 인쇄 화면은 노트·편집기가 준비되고, 모든 `<img>`가 decode되고(깨진 그림은 건너뜀), `document.fonts.ready`이고, `data-print-busy` 속성이 붙은 요소가 하나도 없을 때 `<html data-print-ready="true">`를 단다(노트를 못 읽으면 `"error"`). **비동기로 배치하는 요소(예: 나중에 레이아웃을 계산하는 인포그래픽)는 배치하는 동안 자기 요소에 `data-print-busy`를 달고, 끝나면 지운다.** 인쇄 화면은 최대 15초 기다린 뒤 그대로 신호를 주고, Main은 최대 30초 기다린다(시간 초과·`"error"` → `EXPORT_RENDER_FAILED`).
- **한 장에 맞추기** (`fitToOnePage`, `src/shared/print/page-fit.ts`): 아래 숫자는 기본(A4 세로, 여백 12 mm) 기준이고, 다른 종이·여백은 `pageGeometry`가 인쇄 영역을 바꾼다. 인쇄 화면은 인쇄 영역 폭(≈703 CSS px)으로 그리고 Main이 `[data-print-root]` 높이 H를 잰다. H ≤ 인쇄 높이(≈1032 px) × 0.98이면 `scale` 1. 넘치면 **종이 폭을 채우도록** 폭 W = 703 / s로 넓게 다시 배치해(줄이 길어져 높이가 준다) 높이 H(W)를 재고, `H(W) × s ≤ 0.98 × 인쇄 높이`인 가장 큰 s를 이분 탐색으로 0.01 안까지 찾는다(측정 약 9번, 고른 값은 늘 실제로 잰 값). 그 폭으로 배치한 채 s로 인쇄하면 W × s = 인쇄 폭이다. 그림·인포그래픽은 넓힌 폭을 따라 커지지 않게 인쇄 폭(703 px)을 넘지 않는다 — 커지면 글자만 더 작아진다. 넓혀도 들어가지 않으면(0.1에서도 넘침) 예전처럼 인쇄 폭에서 `0.98 × 인쇄 높이 / H`로 고르게 줄이고, 고르게 줄이는 쪽 배율이 더 크면 그쪽을 쓴다. Chromium의 하한 0.1 아래로는 줄이지 않는다 — 그래도 넘치는 아주 긴 노트는 첫 장만 남고 `clipped: true`, Renderer가 잘렸다고 알린다. 한 장 맞춤이면 `pageRanges: '1'`이므로 결과는 항상 한 장이다. 끄면 배율 1로 모든 장을 인쇄한다(미리보기의 장 수는 근사 — Chromium은 줄 중간에서 자르지 않으려고 조금 일찍 넘긴다).
- E2E: 개발 빌드에서 `BLINK_E2E_PDF_PATH`가 있으면 Dialog 없이 그 경로에 쓴다 (PNG의 `BLINK_E2E_SAVE_PATH`와 같은 방식).

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

`VAULT_NOT_OPEN`, `VAULT_NOT_FOUND`, `VAULT_NOT_ACCESSIBLE`, `NOTE_NOT_FOUND`, `NOTE_TITLE_INVALID`, `NOTE_TITLE_TAKEN`, `NOTE_CONTENT_TOO_LARGE`, `NOTE_WRITE_FAILED`, `FOLDER_NAME_INVALID`, `FOLDER_NAME_TAKEN`, `FOLDER_NOT_FOUND`. PDF 내보내기: `EXPORT_RENDER_FAILED`(인쇄 화면이 준비되지 않았거나 결과가 PDF가 아님), `EXPORT_WRITE_FAILED`.

## Renderer 본문 스키마 계약

```ts
{ type: 'noteLink', attrs: { target: string; label: string } }   // Markdown: [[target]] 또는 [[target|label]]
```
