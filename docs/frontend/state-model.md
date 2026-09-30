# Frontend — State Model

원칙: Main이 원본인 데이터는 **TanStack Query 캐시**에만 둔다. 전역 store(Zustand 등)는 쓰지 않는다. 편집 중인 문서는 예외적으로 **Tiptap 편집기 인스턴스**가 원본이다.

## 분류와 소유자

### Server State (원본: Main)

| State | Query Key | Owner (hook) | 갱신 |
| --- | --- | --- | --- |
| 노트 목록 | `['notes','list']` | `notes/useNoteList` | 저장·생성·삭제 성공 시 invalidate |
| 노트 상세 | `['notes','detail',id]` | `notes/useNoteDetail` | **편집기 초기값으로만 사용.** `staleTime: Infinity`, focus refetch 끔 |
| 링크/백링크 | `['notes','links',id]` | `notes/useNoteLinks` | 저장 성공 시 `['notes','links']` 전체 invalidate |
| 검색 결과 | `['notes','search',query,excludeId]` | `notes/useNoteSearch` | 입력 debounce 200ms, `placeholderData: keepPrevious` |
| 노트의 AI Job | `['ai','jobs',noteId]` | `assist/useNoteJobs` | `ai:job-updated` 이벤트로 `setQueryData` upsert |
| AI 설정 | `['settings','provider']` | `ai-settings/useProviderSettings` | 저장 성공 시 응답으로 `setQueryData` |

### 편집기 문서 (원본: Renderer)

| State | Owner | 비고 |
| --- | --- | --- |
| 열린 노트의 본문·제목 | `NoteEditor`의 Tiptap 인스턴스, `NoteHeader`의 제목 입력 | 노트마다 `key={noteId}`로 새 인스턴스. React state로 복제하지 않는다 |
| 저장 상태 (`idle`/`dirty`/`saving`/`saved`/`error`) | `AutosaveRegistry`의 노트별 `SaveQueue` | React 밖 모듈. `useSyncExternalStore`로 구독 |
| Job 상태 → 장식(Pulse/실패) | `jobDecorationPlugin` 플러그인 상태 | `AssistBridge`가 Job 쿼리 결과를 트랜잭션 meta로 주입 |

**Query 캐시가 편집 중인 문서를 덮어쓰면 안 된다.** 상세 쿼리는 노트를 열 때 한 번만 읽고, 이후의 진실은 편집기다. 저장 성공 후에도 상세 쿼리를 갱신하지 않는다(다시 열 때 새로 읽음 — 노트를 닫으면 캐시 제거 `gcTime: 0`).

### URL State

| State | 위치 |
| --- | --- |
| 현재 노트 | `#/notes/:noteId` |
| 현재 화면 | route |

### Local UI State

| State | Owner |
| --- | --- |
| 검색 팔레트 열림 | `AppShell` |
| 검색 입력값, 선택된 결과, 미리보기 펼침 | `SearchPalette` |
| 삭제 확인 Dialog 열림 | `NoteHeader` |
| Bubble Menu 표시 | Tiptap BubbleMenu (선택에서 파생) |
| 설정 폼 초안 (provider, model, apiKey 입력, baseUrl) | `AIProviderForm` — apiKey는 저장 성공 즉시 비움 |
| 연결 테스트 결과 | `TestConnectionButton` (mutation 결과) |

### Shared Client State (Context)

| State | Provider | Consumer | 이유 |
| --- | --- | --- | --- |
| 현재 편집기 핸들 | `NotePage` → `ActiveEditorContext` | `SearchPalette` (연결·가져오기 대상) | 팔레트는 AppShell에 있고 편집기는 NotePage에 있다 |
| 링크 제목 조회 | `NotePage` → `LinkTitlesContext` | `NoteLinkView` (노드 뷰) | 노드 뷰는 React 트리 밖에서 생성되어 props로 받을 수 없다 |

## 파생 값 (상태로 저장하지 않음)

| 값 | 계산 |
| --- | --- |
| 구체화/정리/시각화 버튼 활성 | `canRunJob(type, activeCapabilities)` — 요구 표는 `src/shared/assist`에서 Main과 공유 |
| 링크 표시 제목 | `links.outgoing`에서 `noteId`로 찾은 현재 제목, 없으면 노드의 `label` |
| 깨진 링크 여부 | `links` 로드 완료 && `outgoing`에 `noteId` 없음 |
| Mark별 Job 상태 | 문서의 `aiPending.jobId` × `['ai','jobs',noteId]` |
| AI 설정 필요 안내 | `settings.active === null` |
| 저장 표시 문구 | `SaveQueue.status` + 마지막 성공 시각 |

## 오류 코드 → UI

| code | 표현 |
| --- | --- |
| `VALIDATION_FAILED`, `INTERNAL_ERROR` | Toast "문제가 발생했습니다" + 재시도(가능한 경우) |
| `NOTE_NOT_FOUND` | 노트 화면: Not Found 상태 / 링크 클릭: Toast "삭제된 노트입니다" |
| `NOTE_TITLE_TOO_LONG` | 제목 입력은 200자에서 입력 제한(선제) — 오류가 오면 저장 상태 `error` |
| `NOTE_CONTENT_TOO_LARGE` | 저장 상태 `error` + "노트가 너무 큽니다" 고정 배너 |
| `AI_PROVIDER_NOT_CONFIGURED` | Toast + `AI 설정 열기` 액션, Mark 제거 |
| `AI_CAPABILITY_UNSUPPORTED` | Toast "현재 모델은 이 기능을 지원하지 않습니다", Mark 제거 |
| `AI_INPUT_EMPTY` / `AI_INPUT_TOO_LONG` | Bubble Menu 단계에서 선제 차단(버튼 비활성 + 툴팁), 오면 Toast |
| Job `failure.code` | 해당 범위의 `JobFailureChip` 문구 ([assist/api-contract.md](../backend/assist/api-contract.md#job-실패-코드-job-상태)) |
| `PROVIDER_SECURE_STORAGE_UNAVAILABLE` | 설정 화면 경고 배너, API Key 입력 비활성 |
| `PROVIDER_API_KEY_REQUIRED`, `PROVIDER_MODEL_NOT_SUPPORTED`, `PROVIDER_BASE_URL_INVALID` | 설정 폼 필드 오류 |
| `EXPORT_*` | Toast |
