# Visualization Domain — Status

| 항목 | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| InfographicSpec — 공통 규칙·정규화 | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `process` | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `hierarchy` | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `comparison` | Done | Pending | N/A | N/A | N/A | Pending |
| InfographicSpec — `mindmap` | Done | Pending | N/A | N/A | N/A | Pending |
| UC-VIS-001 PNG 저장 | Done | Done | Done | Done | N/A | Done |

`SUPPORTED_TYPES` (LLM에 허용하는 유형): Phase 1 시작값 `['process', 'hierarchy']` — 명세서 §39 "Process Renderer + 최소 1개 추가 Renderer". Renderer 구현이 늘면 함께 추가한다.

명세서 §38 구현 순서 매핑: Step 12 → InfographicSpec + Renderer, Step 13 → UC-VIS-001.

## 구현 메모
- 코드: `src/shared/visualization/infographic-spec.ts`(parse·정규화·JSON Schema), 렌더러 `src/renderer/features/visualization/`, 저장 `src/main/visualization/`.
- LLM Structured Output은 strict JSON Schema 제약 때문에 연결을 `{from, to}` 객체로 받고, `VisualizeExecutor`가 저장 형식 `[from, to]`로 바꾼 뒤 `parseInfographicSpec`에 넘긴다.
- `comparison`·`mindmap` 규칙은 설계에 있으나 `SUPPORTED_TYPES`에 없어 LLM이 고를 수 없다(렌더러 미구현).
- E2E는 `BLINK_E2E_SAVE_PATH`(개발 빌드 전용)로 Dialog 대신 정해진 경로에 저장해 실제 PNG 파일(시그니처·크기)을 검증한다.
