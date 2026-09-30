# Assist Domain — API Contract (IPC)

## 타입

```ts
type JobId = string;   // UUID, Renderer 생성
type JobType = 'EXPAND' | 'ORGANIZE' | 'VISUALIZE';
type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

type AIJobView = {
  id: JobId;
  noteId: NoteId;
  type: JobType;
  status: JobStatus;
  inputText: string;                 // Commit 전 비교용 (BR-ASSIST-08)
  attempt: number;
  result?:                           // status === 'COMPLETED'일 때만
    | { kind: 'MARKDOWN'; markdown: string }
    | { kind: 'RESEARCHED_MARKDOWN'; markdown: string; sources: { title: string; url: string }[] }
    | { kind: 'INFOGRAPHIC'; spec: InfographicSpec };
  failure?: {                        // status === 'FAILED'일 때만
    code: JobFailureCode;
    retryable: boolean;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};
```

- `RESEARCHED_MARKDOWN.markdown`은 출처 목록이 이미 붙은 **적용용 최종 Markdown**이다. `sources`는 UI 표시용.
- `failure.message`(진단용)는 IPC로 보내지 않는다. 로그에만 남는다.

## 채널

| 채널 | Preload | 요청 | 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `ai:create-job` | `ai.createJob` | `{ jobId: JobId; noteId: NoteId; type: JobType; inputText: string }` | `AIJobView` | `NOTE_NOT_FOUND`, `AI_PROVIDER_NOT_CONFIGURED`, `AI_CAPABILITY_UNSUPPORTED`, `AI_INPUT_EMPTY`, `AI_INPUT_TOO_LONG`, `AI_JOB_ID_CONFLICT` |
| `ai:get-job` | `ai.getJob` | `{ jobId: JobId }` | `AIJobView` | `AI_JOB_NOT_FOUND` |
| `ai:list-jobs` | `ai.listJobs` | `{ noteId: NoteId }` | `{ items: AIJobView[] }` | — |
| `ai:retry-job` | `ai.retryJob` | `{ jobId: JobId }` | `AIJobView` | `AI_JOB_NOT_FOUND`, `AI_JOB_NOT_RETRYABLE`, `AI_PROVIDER_NOT_CONFIGURED`, `AI_CAPABILITY_UNSUPPORTED` |

## 푸시 이벤트

| 이벤트 | Preload | Payload | 시점 |
| --- | --- | --- | --- |
| `ai:job-updated` | `ai.onJobUpdated(cb) → unsubscribe` | `AIJobView` | 상태가 바뀔 때마다 |

## 오류 코드 (IPC)

| code | 의미 |
| --- | --- |
| `AI_PROVIDER_NOT_CONFIGURED` | 활성 Provider 없음 또는 API Key 없음 → 설정 화면 안내 |
| `AI_CAPABILITY_UNSUPPORTED` | 활성 모델이 이 작업 유형을 지원하지 않음 (`details.missing: Capability[]`) |
| `AI_INPUT_EMPTY` | 선택 텍스트가 비어 있음 |
| `AI_INPUT_TOO_LONG` | 10,000자 초과 (`details.max`) |
| `AI_JOB_ID_CONFLICT` | 같은 ID로 다른 요청이 이미 존재 |
| `AI_JOB_NOT_FOUND` | Job 없음 |
| `AI_JOB_NOT_RETRYABLE` | `FAILED`가 아닌 Job 재시도 |

## Job 실패 코드 (Job 상태)

IPC 오류가 아니라 `AIJobView.failure.code`로 전달된다. 정의는 [domain-model.md](domain-model.md#jobfailure).

| code | retryable | Renderer 안내 예 |
| --- | --- | --- |
| `PROVIDER_NOT_CONFIGURED` | false | AI 설정을 완료하세요 |
| `PROVIDER_AUTH_FAILED` | false | API Key를 확인하세요 |
| `PROVIDER_RATE_LIMITED` | true | 잠시 후 다시 시도하세요 |
| `PROVIDER_UNAVAILABLE` | true | 네트워크 또는 Provider 상태를 확인하세요 |
| `TIMEOUT` | true | 응답이 너무 오래 걸렸습니다 |
| `INVALID_OUTPUT` | true | 결과를 만들지 못했습니다 |
| `NO_SOURCES` | true | 관련 자료를 찾지 못했습니다 |
| `CAPABILITY_UNSUPPORTED` | false | 현재 모델은 이 기능을 지원하지 않습니다 |
| `INTERRUPTED` | true | 앱 종료로 중단되었습니다 |
| `UNKNOWN` | true | 알 수 없는 오류 |

## 명세서 §32 대비 변경

| 명세서 | 설계 | 이유 |
| --- | --- | --- |
| — | `ai:list-jobs` 추가 | 노트를 열 때 Mark 복원 (UC-ASSIST-005) |
| — | `ai:job-updated` 이벤트 추가 | Background Job 완료 통지 |
| `AIJob.selectionFrom/To` | 제거, `jobId` Mark로 대체 | D-03 |
| `AIJob.errorMessage` | `failure.code` (+ 로그용 message) | 사용자 문구는 Renderer 책임 |

## Renderer 본문 스키마 계약

```ts
// Mark
{ type: 'aiPending', attrs: { jobId: JobId } }
// Block atom node (VISUALIZE 결과)
{ type: 'infographic', attrs: { spec: InfographicSpec } }
```
