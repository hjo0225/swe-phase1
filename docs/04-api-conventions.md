# 04. API Conventions (IPC)

Blink의 외부 계약은 HTTP가 아니라 **Renderer ↔ Main IPC**다. 도메인별 채널 명세는 각 `<domain>/api-contract.md`에 있다.

## 채널

| 규칙 | 내용 |
| --- | --- |
| 이름 | `<resource>:<action>` kebab-case. 예: `note:search`, `ai:create-job` |
| 요청/응답 | `ipcRenderer.invoke` ↔ `ipcMain.handle` 만 사용. `ipcRenderer.send`(단방향)는 쓰지 않는다. |
| 푸시 이벤트 | Main → Renderer는 `webContents.send('<resource>:<event>', payload)`. 과거형 이름. 예: `ai:job-updated` |
| 인자 | 채널당 **객체 하나**. 위치 인자 금지 → 필드 추가가 하위 호환된다. |
| 화이트리스트 | Preload는 `src/shared/ipc/channels.ts`에 정의된 채널만 노출한다. `ipcRenderer` 자체를 노출하지 않는다. |

## Preload API 모양

```ts
window.blink.notes.create(req)       // note:create
window.blink.notes.listLinks(req)    // note-link:list
window.blink.ai.createJob(req)       // ai:create-job
window.blink.ai.onJobUpdated(cb)     // ai:job-updated 구독, 해제 함수 반환
window.blink.settings.updateProvider(req)
window.blink.visualization.savePng(req)
```

## 응답: Result Envelope (D-06)

Main 핸들러는 **예외를 던지지 않는다.** 항상 다음을 반환한다.

```ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: BlinkErrorCode; message: string; details?: unknown } };
```

- Preload는 `ok: false`를 `BlinkIpcError(code, message, details)`로 변환해 throw 한다. Renderer 코드는 `try/catch` 또는 React Query의 `error`로 처리한다.
- `message`는 개발자용 설명이다. 사용자 문구는 Renderer가 `code` 기준으로 결정한다.
- 예상하지 못한 예외는 `INTERNAL_ERROR`로 변환하고 스택은 Main 로그에만 남긴다.

## 공통 오류 코드

| code | 의미 |
| --- | --- |
| `VALIDATION_FAILED` | 전송 검증(Zod) 실패. `details`에 필드 경로 목록 |
| `INTERNAL_ERROR` | 예상하지 못한 오류 |

도메인 오류 코드는 각 `api-contract.md`에 정의한다. 코드는 `SCREAMING_SNAKE_CASE`, 도메인 접두어(`NOTE_`, `AI_`, `PROVIDER_`, `EXPORT_`)를 쓴다.

## 데이터 표현

| 항목 | 규칙 |
| --- | --- |
| ID | UUID v4 문자열 (`crypto.randomUUID()`). 기본은 Main이 생성. **예외: AI Job ID는 Renderer가 생성**한다(Pending Mark를 요청 전에 걸기 위해, [assist/use-cases.md](assist/use-cases.md#uc-assist-001-ai-작업-요청)). Main은 형식과 중복을 검증한다 |
| 시각 | ISO 8601 UTC 문자열 (`2026-09-30T09:00:00.000Z`). DB에는 epoch ms 정수 |
| Enum | 대문자 문자열 리터럴 (`EXPAND`, `QUEUED`). Provider ID만 소문자(`openai`, `kimi`) |
| 선택 필드 | 없으면 생략(`undefined`). `null`은 "명시적으로 값 없음"일 때만 응답에서 사용 |
| 바이너리 | `Uint8Array` (structured clone) |
| 노트 본문 | ProseMirror JSON 객체 그대로 (`{ type: 'doc', content: [...] }`) |

## 목록과 페이지네이션

로컬 단일 사용자 앱이므로 Phase 1에서는 페이지네이션을 두지 않는다. 대신 목록 응답은 **요약 타입**만 반환해 크기를 제한한다(노트 목록에 본문 JSON 미포함). 검색은 `limit`(기본 20, 최대 50)을 둔다.

## 멱등성

- 조회 채널은 모두 멱등이다.
- `note:update`는 전체 값 덮어쓰기이므로 멱등이다(자동 저장 재전송 안전).
- `ai:create-job`은 Renderer가 만든 `jobId` 기준으로 멱등이다. 같은 ID·같은 내용의 재요청은 기존 Job을 반환하고, 같은 ID·다른 내용은 `AI_JOB_ID_CONFLICT`.
- `ai:retry-job`은 `FAILED` 상태에서만 허용되므로 두 번째 호출은 `AI_JOB_NOT_RETRYABLE`로 거절된다.

## 버전

앱과 IPC 계약은 항상 함께 배포되므로 채널 버전을 두지 않는다. **저장 데이터**(노트 본문 JSON, InfographicSpec)는 스키마 버전을 가진다(`InfographicSpec.version`).
