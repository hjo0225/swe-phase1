# Assist Domain — Cross-Cutting

## 검증 분리

| 단계 | 대상 | 위치 |
| --- | --- | --- |
| 전송 | `jobId`/`noteId` UUID, `type` enum, `inputText` string | `ai:*` handler Zod |
| 애플리케이션 | 노트 존재, 활성 Provider 존재 | `CreateAIJob`, `RetryAIJob` |
| 도메인 | 입력 길이, Capability 요구, 상태 전이, 결과 형식 | `InputSnapshot`, `AIJob`, `JobResult` |
| 결과(LLM 출력) | Spec 형식(Zod) + 구조 불변식 | `VisualizeExecutor` → visualization `InfographicSpec.parse` |
| 적용 직전 | 범위 텍스트 == `inputText` | Renderer Commit (BR-ASSIST-08) |

## 트랜잭션

- Job 저장은 행 1개 UPSERT이므로 별도 트랜잭션 불필요.
- **LLM 호출 중에는 어떤 트랜잭션도 열려 있지 않다.** 상태 저장은 `start` 직후, `complete/fail` 직후 각각 한 번.

## 동시성

| 항목 | 정책 |
| --- | --- |
| 전역 동시 실행 | 최대 2. 나머지는 `QUEUED` (FIFO). Provider Rate Limit과 비용 보호 |
| 같은 범위 중복 요청 | Selection Lock으로 잠긴 범위는 다시 선택할 수 없다 |
| 같은 노트 여러 Job | 허용(겹치지 않는 범위). 각자 독립 Commit |
| 노트 삭제 중 실행 | FK cascade로 Job 삭제 → Runner 완료 시 재조회 결과 없음 → 폐기 |
| 설정 변경 중 실행 | 실행 중인 Job은 시작 시점 Provider로 끝까지 진행. 대기 중인 Job은 시작 시점 설정을 사용 |
| 취소 | Phase 1 미지원(명세서에 없음). Runner는 Job별 `AbortController`를 가지므로 추후 `ai:cancel-job` 추가가 쉽다 |

## 제한 시간

`withTimeout`이 만료되면 `AbortController.abort()`로 HTTP 요청을 끊고 `TIMEOUT`으로 실패시킨다. 늦게 도착한 응답은 무시된다.

## 보관 기간

`COMPLETED`/`FAILED` Job은 완료 30일 후 시작 시 정리한다. 정리된 Job을 가리키는 Mark는 노트를 열 때 "Job 없음"으로 처리되어 제거되고 원문이 유지된다 — 데이터 손실 없음.

## 프라이버시

- Provider로 보내는 것은 `inputText`와 프롬프트뿐이다. 노트 제목, 다른 본문은 보내지 않는다.
- 로그에 `inputText`, 결과 본문을 남기지 않는다. Job ID, 유형, 상태, 소요 시간, 실패 코드만.

## 테스트 포인트

| 대상 | 핵심 케이스 |
| --- | --- |
| `AIJob` | 모든 허용/금지 전이, 상태별 불변식, Capability 부족 시 request/retry/start 거절, `isSameRequest` |
| `JobResult` | 코드 펜스 제거, 길이 경계, 출처 0건 → `NO_SOURCES`, 비 http(s) 출처 제거, 중복·5건 제한, `commitMarkdown` 형식 |
| `JobRunner` | 동시 실행 상한, FIFO, 제한 시간, 실행 중 Job 삭제 → 폐기, 예외 → 실패 코드 매핑, 이벤트 발행 순서 |
| `CreateAIJob` | 멱등 재요청, ID 충돌, 노트 없음, Provider 없음 |
| `RecoverInterruptedJobs` | QUEUED/RUNNING → INTERRUPTED, 30일 정리 |
