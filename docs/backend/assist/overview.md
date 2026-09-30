# Assist Domain — Overview

## 목적

사용자가 선택한 텍스트를 AI로 **구체화(EXPAND) · 정리(ORGANIZE) · 시각화(VISUALIZE)** 하는 작업을 백그라운드 Job으로 수행하고, 결과를 원문에 **원자적으로** 적용하게 한다. 명세서의 **Major 1**과 §9~§17을 담당한다.

## 소유

- AI Job 생명주기: 요청 → 대기 → 실행 → 완료/실패 → 재시도
- Job 유형별 필요 Capability와 입력 제한
- 유형별 파이프라인(프롬프트, Provider 호출, 결과 검증)
- 완료 결과의 형식 보장: **검증을 통과한 결과만 `COMPLETED`**
- Pending Mark 규약과 Commit 프로토콜(Renderer가 따르는 규칙)
- 앱 재시작 시 중단된 Job 정리

## 소유하지 않음

- 노트 본문 쓰기 → Renderer가 결과를 적용하고 note 도메인으로 저장 (D-04)
- Provider 설정·API Key·모델 Capability 판정 → ai-provider
- InfographicSpec 구조 규칙 → visualization
- Pulse 애니메이션, Selection Lock 구현 → Renderer (규칙은 여기서 정의)

## 핵심 설계 결정

1. **Job의 적용 위치는 본문에 저장되는 Pending Mark다** (D-03). Mark는 `jobId`를 갖고 노트 본문과 함께 자동 저장된다. 그래서 사용자가 다른 노트로 이동하거나 앱이 종료되어도 결과가 어디에 적용될지 잃지 않는다.
2. **Main은 결과를 만들고, Renderer가 적용한다** (D-04). Commit은 Renderer 편집기의 단일 트랜잭션(Mark 범위 교체 + Mark 제거)이며, 이후 평소처럼 자동 저장된다.
3. **적용 여부를 Job 상태로 추적하지 않는다.** Mark가 본문에 남아 있으면 미적용, 없으면 적용 완료(또는 폐기)다. 앱이 적용 직후 저장 전에 종료되면 다음에 노트를 열 때 다시 적용된다 — 저장된 본문 기준으로 올바른 동작이다.
4. Phase 1에서는 중단된 Job을 재개하지 않고 `FAILED(INTERRUPTED)`로 만든다 (D-07).

## 용어

| 용어 | 정의 |
| --- | --- |
| AIJob | AI 변환 요청 1건 |
| Input Snapshot | 요청 시점의 선택 텍스트(`inputText`). 실행은 이 스냅샷만 사용 |
| JobResult | 유형별 검증된 결과: Markdown(+출처) 또는 InfographicSpec |
| JobFailure | 실패 코드 + 진단 메시지 |
| Pending Mark | `aiPending` 편집기 Mark, `attrs.jobId`. 해당 범위를 잠그고 Pulse 표시 |
| Commit | 완료된 결과를 Mark 범위에 한 번에 적용하는 Renderer 트랜잭션 |
