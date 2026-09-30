# Assist Domain — Use Cases

---

## UC-ASSIST-001 AI 작업 요청

- **Actor:** 사용자
- **Trigger:** 텍스트 선택 → Bubble Menu에서 `구체화` / `정리` / `시각화`
- **Preconditions:** 노트가 존재한다. 활성 Provider가 설정되어 있다.
- **Main Flow:**
  1. (Renderer) Bubble Menu를 닫는다.
  2. (Renderer) `jobId`(UUID)를 생성하고, 선택 범위에 `aiPending { jobId }` Mark를 **먼저** 적용한다 → 즉시 잠금 + Pulse. 범위 텍스트를 `inputText`로 읽는다.
  3. (Renderer) `ai:create-job { jobId, noteId, type, inputText }` 호출.
  4. 노트 존재를 확인한다.
  5. 활성 Provider의 Capability를 조회한다.
  6. `AIJob.request()` — 입력 규칙과 유형별 필요 Capability를 검사하고 `QUEUED` Job을 만든다.
  7. Job을 저장하고 Runner 큐에 넣는다.
  8. Job 정보를 반환한다.
- **Alternative Flow:**
  - 같은 `jobId`로 다시 요청(재전송) → 기존 Job을 그대로 반환 (멱등).
  - 4~6 실패 → (Renderer) Mark 제거, 원문 그대로, 오류 코드별 안내.
- **Failure Cases:** `NOTE_NOT_FOUND`, `AI_PROVIDER_NOT_CONFIGURED`, `AI_CAPABILITY_UNSUPPORTED`, `AI_INPUT_EMPTY`, `AI_INPUT_TOO_LONG`, `AI_JOB_ID_CONFLICT`(같은 ID가 다른 내용으로 이미 존재)
- **Business Rules:** BR-ASSIST-01, 02
- **Postconditions:** `QUEUED` Job이 존재하고, 본문의 해당 범위에 같은 `jobId`의 Pending Mark가 있다.

> Job ID를 Renderer가 만드는 이유: Mark는 요청 **전에** 걸려야 스냅샷과 잠금 범위 사이에 편집이 끼어들 틈이 없다. 그 시점에 ID가 필요하다. 부수 효과로 요청이 멱등해진다.

## UC-ASSIST-002 AI 작업 실행

- **Actor:** 시스템 (Job Runner)
- **Trigger:** 큐에 `QUEUED` Job이 있고 동시 실행 여유가 있음
- **Main Flow:**
  1. Job을 `RUNNING`으로 전환하고 사용한 Provider/모델을 기록, 저장, `ai:job-updated` 발행.
  2. 유형별 파이프라인 실행 (트랜잭션 밖, 제한 시간 적용):
     - **ORGANIZE:** 구조 분석·재작성 프롬프트 → 텍스트 생성 → Markdown 정리
     - **EXPAND:** 조사 의도 분석 + Provider Native Web Search → 출처 수집 → 재작성
     - **VISUALIZE:** Structured Output(JSON Schema) → Zod 형식 검증 → InfographicSpec 불변식 검증·정규화
  3. 결과를 도메인 규칙으로 검증한다 (BR-ASSIST-03, 04).
  4. `COMPLETED`(결과 포함)로 전환, 저장, `ai:job-updated` 발행.
- **Alternative Flow:**
  - 2~3 실패 → `FAILED`(실패 코드) 전환, 저장, 발행.
  - 4 시점에 Job이 이미 삭제됨(노트 삭제) → 결과 폐기, 이벤트 없음.
  - 실행 직전 활성 Provider가 없거나 Capability를 잃음(설정 변경) → `FAILED(PROVIDER_NOT_CONFIGURED / CAPABILITY_UNSUPPORTED)`.
- **Failure Codes:** `PROVIDER_NOT_CONFIGURED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`, `INVALID_OUTPUT`, `NO_SOURCES`, `CAPABILITY_UNSUPPORTED`
- **Postconditions:** Job은 `COMPLETED` 또는 `FAILED`. 노트 본문은 변경되지 않았다.

## UC-ASSIST-003 결과 적용 (Commit)

- **Actor:** Renderer (사용자 개입 없음)
- **Trigger:** `ai:job-updated` 이벤트로 `COMPLETED` 수신, 또는 노트를 열 때 Mark의 Job이 `COMPLETED`
- **Preconditions:** 현재 편집기에 해당 `jobId`의 Pending Mark가 있다.
- **Main Flow (단일 편집기 트랜잭션):**
  1. Mark 범위의 텍스트가 Job의 `inputText`와 같은지 확인한다.
  2. 유형별 적용:
     - EXPAND / ORGANIZE: Mark 범위를 결과 Markdown을 파싱한 노드로 **교체**
     - VISUALIZE: 원문 유지, Mark 범위를 포함한 블록 **바로 아래**에 `infographic { spec }` 노드 삽입 (Q-01)
  3. Mark 제거 → 잠금 해제, Pulse 종료.
  4. 자동 저장 → UC-NOTE-004.
- **Alternative Flow:**
  - 1 불일치 → 결과를 적용하지 않고 Mark만 제거, "원문이 바뀌어 적용하지 않았습니다" 알림.
  - 해당 노트가 열려 있지 않음 → 아무것도 하지 않는다. 다음에 열 때 적용된다 (UC-ASSIST-005).
- **Postconditions:** 결과가 한 번에 적용되었거나, 원문이 그대로 남아 있다. 중간 상태는 없다.

## UC-ASSIST-004 작업 재시도

- **Actor:** 사용자
- **Trigger:** 실패 표시된 범위의 `재시도`
- **Preconditions:** Job이 `FAILED`. 본문에 해당 Mark가 있고 범위 텍스트가 `inputText`와 같다(Renderer 확인).
- **Main Flow:**
  1. `ai:retry-job { jobId }`
  2. 활성 Provider Capability를 다시 확인한다.
  3. `job.retry()` → `QUEUED`, `attempt + 1`, 이전 실패 정보 제거.
  4. 저장, 큐에 넣기, 발행.
  5. (Renderer) Mark를 다시 잠금 + Pulse 상태로.
- **Failure Cases:** `AI_JOB_NOT_FOUND`, `AI_JOB_NOT_RETRYABLE`, `AI_PROVIDER_NOT_CONFIGURED`, `AI_CAPABILITY_UNSUPPORTED`
- **Business Rules:** BR-ASSIST-05

## UC-ASSIST-005 노트를 열 때 보류 작업 복원

- **Actor:** Renderer
- **Trigger:** 노트를 편집기에 로드
- **Main Flow:**
  1. 본문에서 모든 `aiPending` Mark의 `jobId`를 모은다. 없으면 종료.
  2. `ai:list-jobs { noteId }`로 이 노트의 Job들을 조회한다.
  3. Mark별 처리:
     - `QUEUED`/`RUNNING` → 잠금 + Pulse
     - `COMPLETED` → UC-ASSIST-003
     - `FAILED` → 잠금 해제, 실패 표시(재시도/닫기)
     - 목록에 없음(다른 노트의 Job, 정리된 Job) → Mark 제거
- **Business Rules:** BR-ASSIST-06

## UC-ASSIST-006 중단된 작업 정리

- **Actor:** 시스템
- **Trigger:** 앱 시작 (IPC 등록 전)
- **Main Flow:**
  1. `QUEUED`/`RUNNING` Job을 모두 `FAILED(INTERRUPTED)`로 전환한다.
  2. 보관 기간(30일)이 지난 `COMPLETED`/`FAILED` Job을 삭제한다.
- **Postconditions:** 실행 중인 Job이 없다. 사용자는 노트를 열 때 실패 표시와 재시도를 본다.

---

## Business Rules

| ID | 규칙 |
| --- | --- |
| BR-ASSIST-01 | `inputText`는 공백 제외 1자 이상, 최대 10,000자. |
| BR-ASSIST-02 | 유형별 필요 Capability: ORGANIZE = `generate`, EXPAND = `generate` + `webSearch`, VISUALIZE = `generate` + `structuredOutput`. 요청·재시도·실행 시작 시점에 모두 검사한다. |
| BR-ASSIST-03 | EXPAND/ORGANIZE 결과는 공백 제외 1자 이상, 최대 20,000자의 Markdown. 감싼 코드 펜스(```` ```markdown ````)는 제거한다. |
| BR-ASSIST-04 | EXPAND 결과는 http(s) 출처 1건 이상을 가져야 한다(없으면 `NO_SOURCES`). 출처는 URL 기준 중복 제거 후 최대 5건, 결과 끝에 `출처` 목록으로 붙인다 (Q-02). VISUALIZE 결과는 유효한 InfographicSpec이어야 한다. |
| BR-ASSIST-05 | 재시도는 `FAILED`에서만 가능하다. 같은 Job ID와 같은 Input Snapshot을 사용한다. |
| BR-ASSIST-06 | Pending Mark는 **같은 노트의 Job**을 가리킬 때만 유효하다. 내용 가져오기로 복사된 Mark는 삽입 시 제거하고, 남아 있더라도 UC-ASSIST-005에서 제거된다. |
| BR-ASSIST-07 | 제한 시간: ORGANIZE·VISUALIZE 60초, EXPAND 120초. 초과 시 `TIMEOUT`. |
| BR-ASSIST-08 | 결과 적용 전 Mark 범위 텍스트가 `inputText`와 다르면 적용하지 않는다 (Atomic 보장의 마지막 방어선). |
