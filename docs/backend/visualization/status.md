# Visualization Domain — Status

| 항목 | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| InfographicSpec — 공통 규칙·정규화 | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `process` | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `hierarchy` | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `comparison` | Done | Done | N/A | N/A | N/A | Done |
| InfographicSpec — `mindmap` | Done | Done | N/A | N/A | N/A | Done |
| UC-VIS-001 PNG 저장 | Done | Done | Done | Done | N/A | Done |

`SUPPORTED_TYPES` (LLM에 허용하는 유형): `['process', 'hierarchy', 'comparison', 'mindmap']` — 명세서 §16의 네 유형 모두 렌더러가 있다.

명세서 §38 구현 순서 매핑: Step 12 → InfographicSpec + Renderer, Step 13 → UC-VIS-001.

## 구현 메모
- 코드: `src/shared/visualization/infographic-spec.ts`(parse·정규화·JSON Schema), 렌더러 `src/renderer/features/visualization/`, 저장 `src/main/visualization/`.
- LLM Structured Output은 strict JSON Schema 제약 때문에 연결을 `{from, to}` 객체로 받고, `VisualizeExecutor`가 저장 형식 `[from, to]`로 바꾼 뒤 `parseInfographicSpec`에 넘긴다.
- 레이아웃(`renderers/layout.ts`): `comparison`은 비교 대상마다 한 열(대상 카드가 머리, 특징은 같은 순번끼리 줄을 맞춤, 연결선 대신 열 배경 패널), `mindmap`은 중심을 가운데 두고 주제를 오른쪽(앞 절반)·왼쪽으로 나누어 세부를 바깥 열에 쌓는다.
- E2E는 `BLINK_E2E_SAVE_PATH`(개발 빌드 전용)로 Dialog 대신 정해진 경로에 저장해 실제 PNG 파일(시그니처·크기)을 검증한다.
