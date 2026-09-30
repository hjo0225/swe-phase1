# Note Domain — Domain Model

## Value Objects

### NotePath

보관함 기준 상대 경로. 구분자는 항상 `/`, 끝은 `.md`.

| 행위 | 설명 |
| --- | --- |
| `NotePath.of(raw)` | `\`→`/`, 앞뒤 `/` 제거, `..`·절대 경로·숨김 폴더 경로 거절 |
| `name` | 파일 이름에서 `.md`를 뺀 것 = 노트 제목 |
| `folder` | 부모 폴더 경로(`''` = 맨 위) |
| `linkTarget` | 확장자 없는 경로 (`프로젝트/회의록`) |
| `withName(name)` / `inFolder(folder)` | 이름 변경·이동 결과 경로 |

### NoteName (= 제목, D-16)

- `NoteName.of(raw)`: 앞뒤 공백 제거, 1~200자, `\ / : * ? " < > |` 없음, `.`으로 시작·끝 금지 → 아니면 `NOTE_TITLE_INVALID`.
- 폴더 이름(`FolderName`)도 같은 규칙, 오류 코드만 `FOLDER_NAME_INVALID`.
- 새 노트 이름: `제목 없음`, 겹치면 `제목 없음 1`, `제목 없음 2`… (`uniqueName(base, taken)`)

### NoteContent (Markdown)

| 항목 | 내용 |
| --- | --- |
| Creation | `NoteContent.fromMarkdown(md)` — UTF-8 2 MB 초과면 `NOTE_CONTENT_TOO_LARGE` |
| `markdown` | 파일 내용 그대로 |
| `plainText` | BR-NOTE-08 규칙으로 뽑은 검색용 텍스트 |
| `linkTargets` | 본문의 `[[대상]]`·`[[대상\|별칭]]`에서 뽑은 대상 텍스트 집합 (코드 블록 안은 제외) |

편집기 문서 구조는 알지 못한다. Markdown 문자열에서 정규식 수준으로 필요한 것만 뽑는다.

## 링크 해석 — Shared Kernel (`src/shared/notes/wiki-link.ts`)

Main(백링크·이름 변경 시 링크 고치기)과 Renderer(링크 표시·이동·삽입)가 **같은 규칙**을 쓴다.

| 함수 | 규칙 (BR-NOTE-03) |
| --- | --- |
| `resolveLinkTarget(target, notes)` | ① 확장자 없는 경로가 같은 노트 ② 없으면 이름이 같은 노트 중 경로가 가장 짧은 것. 대소문자 무시, 앞뒤 공백 무시, `#제목`·`^블록` 부분은 무시 |
| `linkTargetFor(path, allPaths)` | 이름이 보관함에서 유일하면 이름, 아니면 확장자 없는 경로 |
| `rewriteLinkTargets(markdown, map)` | `[[옛 대상]]`·`[[옛 대상\|별칭]]`의 대상만 바꾸고 별칭·나머지 본문은 그대로 둔다. 코드 블록 안은 건드리지 않는다 |

## Entity: Note (색인 항목)

| 항목 | 내용 |
| --- | --- |
| State | `id`(UUID, 색인이 부여), `path: NotePath`, `content: NoteContent`, `createdAt`(파일 생성 시각), `updatedAt`(파일 수정 시각) |
| Behavior | `rename(name)`, `moveTo(folder)`, `replaceContent(content, now)` → 바뀌었는지 반환 |
| Invariants | 경로는 보관함 안의 `.md`. 제목은 경로에서 파생(따로 저장하지 않음) |

Note Link는 더 이상 "존재하는 노트만" 저장하지 않는다. 대상 텍스트를 그대로 색인하고 **조회 시점에 해석**한다 — 대상 노트가 나중에 생기거나 이름이 바뀌어도 맞게 보인다.

## Vault

| 항목 | 내용 |
| --- | --- |
| State | `root`(절대 경로), `name`(폴더 이름) |
| 규칙 | 한 번에 하나만 열려 있다. 전환하면 이전 색인 DB·감시를 닫는다 |
| 최근 목록 | 앱 설정 파일에 최대 10개, 가장 최근 먼저 |
