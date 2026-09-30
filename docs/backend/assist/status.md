# Assist Domain — Status

| Use Case | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| UC-ASSIST-001 AI 작업 요청 | Done | Done | Done | Done | Done | Done |
| UC-ASSIST-002 실행 — ORGANIZE | Done | Done | Done | N/A | Done | Done |
| UC-ASSIST-002 실행 — EXPAND | Done | Done | Done | N/A | Done | Done |
| UC-ASSIST-002 실행 — VISUALIZE | Done | Done | Done | N/A | Done | Done |
| UC-ASSIST-003 Commit (Renderer) | Done | N/A | N/A | N/A (Renderer) | N/A | Done |
| UC-ASSIST-004 재시도 | Done | Done | Done | Done | Done | Done |
| UC-ASSIST-005 노트 열 때 복원 | Done | N/A | Done | Done | Done | Done |
| UC-ASSIST-006 중단 작업 정리 | Done | Done | Done | N/A | Done | Done |

명세서 §38 구현 순서 매핑: Step 6 → Bubble Menu(Renderer), Step 8 → ORGANIZE, Step 9 → Runner·이벤트·UC-001/005, Step 10 → Selection Lock(Renderer)·UC-003, Step 11 → EXPAND, Step 12 → VISUALIZE.

> 명세서는 Step 8(정리)을 Step 9(Job Manager)보다 먼저 두지만, 이 설계에서는 정리도 처음부터 Job으로 실행한다. Step 8·9를 한 번에 구현하는 것을 권장한다 — 동기 호출로 먼저 만든 뒤 Job으로 바꾸면 IPC 계약과 Renderer 흐름을 두 번 만든다.

## 구현 메모
- `AIJob.retry(capabilities)` — 재시도 시각을 기록하지 않으므로 `now` 인자는 없다.
- Runner 실패 매핑: ProviderError `MODEL_NOT_FOUND` → `PROVIDER_UNAVAILABLE`, `UNSUPPORTED`(400) → `CAPABILITY_UNSUPPORTED`, `BAD_RESPONSE` → `INVALID_OUTPUT`, 그 외 예외 → `UNKNOWN`(이름만 기록, 로그).
- Renderer는 IPC 응답과 `ai:job-updated` 이벤트의 도착 순서가 뒤바뀌는 것에 대비해 더 오래된 상태로 캐시를 덮어쓰지 않는다(`isNewerJob`: attempt, 상태 순위). `ai:create-job` 응답을 기다리는 jobId(`requestingJobs`)는 목록에 없어도 Mark를 지우지 않는다.
- 실패한 Job의 범위는 잠금이 풀린다. 그 범위를 편집한 뒤 재시도하면 Renderer가 스냅샷 불일치로 거절하고 Mark를 제거한다.
- 적용 직후 Mint glow(design-system "적용 완료")는 아직 없다.
- Commit은 사용자의 커서를 옮기지 않는다(`insertContentAt`의 `updateSelection: false`). 다른 곳에서 쓰는 중에 결과가 도착해도 입력이 결과 쪽으로 끌려가지 않는다 (E2E Scenario 2에서 발견).
