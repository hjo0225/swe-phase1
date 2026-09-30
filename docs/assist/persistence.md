# Assist Domain — Persistence

### `ai_jobs`

| 컬럼 | 타입 | 제약 | 비고 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | Renderer 생성 UUID |
| `note_id` | TEXT | NOT NULL, FK → `notes.id` ON DELETE CASCADE | |
| `type` | TEXT | NOT NULL, CHECK IN (`EXPAND`,`ORGANIZE`,`VISUALIZE`) | |
| `status` | TEXT | NOT NULL, CHECK IN (`QUEUED`,`RUNNING`,`COMPLETED`,`FAILED`) | |
| `input_text` | TEXT | NOT NULL | Input Snapshot |
| `result_kind` | TEXT | NULL | `MARKDOWN` / `RESEARCHED_MARKDOWN` / `INFOGRAPHIC` |
| `result_text` | TEXT | NULL | 적용용 최종 Markdown |
| `result_data` | TEXT | NULL | JSON: `{ sources }` 또는 `{ spec }` |
| `failure_code` | TEXT | NULL | |
| `failure_message` | TEXT | NULL | 진단용, 민감정보 없음 |
| `provider` | TEXT | NULL | 실행한 Provider |
| `model` | TEXT | NULL | 실행한 모델 |
| `attempt` | INTEGER | NOT NULL DEFAULT 1 | |
| `created_at` | INTEGER | NOT NULL | |
| `started_at` | INTEGER | NULL | |
| `completed_at` | INTEGER | NULL | |

인덱스

- `idx_ai_jobs_note (note_id, created_at DESC)` — `ai:list-jobs`
- `idx_ai_jobs_status (status)` — 시작 시 복구, 보관 기간 정리

## 매핑

| Domain | Persistence |
| --- | --- |
| `JobResult.MARKDOWN` | `result_kind`, `result_text` |
| `JobResult.RESEARCHED_MARKDOWN` | `result_kind`, `result_text`, `result_data = { sources }` |
| `JobResult.INFOGRAPHIC` | `result_kind`, `result_data = { spec }`, `result_text` NULL |
| `JobFailure` | `failure_code`, `failure_message` (`retryable`은 code에서 계산, 저장 안 함) |

복원 시 상태별 불변식([domain-model.md](domain-model.md#불변식))을 만족하지 않는 행은 손상 데이터로 보고 `FAILED(UNKNOWN)`으로 복원한다.

명세서 §34의 `selectionFrom`, `selectionTo`, `errorMessage` 컬럼과 `Visualization` 테이블은 두지 않는다 (D-03, D-05).
