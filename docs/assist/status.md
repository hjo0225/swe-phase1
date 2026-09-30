# Assist Domain — Status

| Use Case | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| UC-ASSIST-001 AI 작업 요청 | Done | Pending | Pending | Pending | Pending | Pending |
| UC-ASSIST-002 실행 — ORGANIZE | Done | Pending | Pending | N/A | Pending | Pending |
| UC-ASSIST-002 실행 — EXPAND | Done | Pending | Pending | N/A | Pending | Pending |
| UC-ASSIST-002 실행 — VISUALIZE | Done | Pending | Pending | N/A | Pending | Pending |
| UC-ASSIST-003 Commit (Renderer) | Done | N/A | N/A | N/A (Renderer) | N/A | Pending |
| UC-ASSIST-004 재시도 | Done | Pending | Pending | Pending | Pending | Pending |
| UC-ASSIST-005 노트 열 때 복원 | Done | N/A | Pending | Pending | Pending | Pending |
| UC-ASSIST-006 중단 작업 정리 | Done | Pending | Pending | N/A | Pending | Pending |

명세서 §38 구현 순서 매핑: Step 6 → Bubble Menu(Renderer), Step 8 → ORGANIZE, Step 9 → Runner·이벤트·UC-001/005, Step 10 → Selection Lock(Renderer)·UC-003, Step 11 → EXPAND, Step 12 → VISUALIZE.

> 명세서는 Step 8(정리)을 Step 9(Job Manager)보다 먼저 두지만, 이 설계에서는 정리도 처음부터 Job으로 실행한다. Step 8·9를 한 번에 구현하는 것을 권장한다 — 동기 호출로 먼저 만든 뒤 Job으로 바꾸면 IPC 계약과 Renderer 흐름을 두 번 만든다.
