# Visualization Domain — Overview

## 목적

선택 텍스트를 인포그래픽으로 바꾸는 과정에서 **"LLM이 만든 구조가 그릴 수 있는 구조인가"** 를 보장하고, 완성된 인포그래픽을 PNG로 저장한다. 명세서 §15~§19를 담당한다.

## 소유

- `InfographicSpec`: 형식(스키마), 유형별 구조 불변식, 정규화, 스키마 버전
- LLM에 전달할 JSON Schema (Structured Output용)
- PNG 파일 저장 (Save Dialog + 파일 쓰기)

## 소유하지 않음

- Spec 생성(LLM 호출) → assist `VisualizeExecutor`
- 레이아웃, 색상, 타이포그래피, SVG 렌더링, Canvas 래스터화 → Renderer (명세서 §15.2 "Blink" 열, §17, §18)
- 인포그래픽의 노트 내 위치 → 노트 본문의 `infographic` 노드 (D-05)

## 핵심 설계 결정

1. **Shared Kernel.** `InfographicSpec` 코드는 `src/shared/visualization/`에 둔다. Main은 LLM 결과 검증에, Renderer는 본문에 저장된 Spec을 그리기 전 검증에 **같은 규칙**을 쓴다. 순수 TypeScript + Zod이며 Electron/React 의존이 없다.
2. **저장 테이블 없음** (D-05). Spec은 노트 본문 노드에 들어가고, SVG는 Spec에서 매번 결정적으로 렌더링한다.
3. **LLM에게 허용하는 유형 = Renderer가 구현한 유형.** 구현되지 않은 유형을 LLM이 고르면 그릴 수 없으므로, `SUPPORTED_TYPES` 상수로 스키마의 `type` enum을 제한한다. Renderer를 추가할 때 이 상수를 함께 늘린다.
4. PNG 래스터화는 Renderer(Canvas)가 하고, Main은 **파일 저장만** 한다. Main에서 SVG를 다시 렌더링하려면 브라우저 엔진이나 폰트 처리가 필요해 불필요하게 무겁다.
