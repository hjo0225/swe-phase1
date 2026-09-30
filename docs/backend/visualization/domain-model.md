# Visualization Domain — Domain Model

## Value Object: InfographicSpec

```ts
type InfographicType = 'process' | 'hierarchy' | 'comparison' | 'mindmap';

type InfographicSpec = {
  version: 1;
  type: InfographicType;
  title: string;
  nodes: { id: string; title: string; description?: string }[];
  edges: [from: string, to: string][];
};
```

명세서 §15.3 형식에 `version`을 추가했다. Spec은 노트 본문에 영구 저장되므로 형식이 바뀌면 이전 Spec을 읽을 수 있어야 한다.

### 생성

```ts
InfographicSpec.parse(raw: unknown): InfographicSpec   // 실패 시 InfographicSpecError(reason)
```

1. **형식 검증** (Zod) — 필드 타입, 길이
2. **정규화** — 문자열 trim, 중복 edge 제거, `process`의 빈 edges를 노드 순서 체인으로 채움
3. **구조 불변식** — 공통 규칙 + 유형별 규칙

같은 함수가 LLM 결과(Main)와 저장된 Spec(Renderer) 모두에 쓰인다. 결과가 같은 Spec이면 멱등이다.

### 공통 규칙

| ID | 규칙 |
| --- | --- |
| BR-VIS-01 | `type` ∈ `SUPPORTED_TYPES` |
| BR-VIS-02 | `title` 1~60자, 노드 `title` 1~40자, `description` 최대 120자 |
| BR-VIS-03 | 노드 2~16개, `id`는 비어 있지 않고 유일 |
| BR-VIS-04 | 모든 edge의 양 끝은 존재하는 노드 ID이며, 자기 자신을 가리키지 않는다 |

### 유형별 규칙

| 유형 | 구조 | 규칙 |
| --- | --- | --- |
| `process` | 선형 체인 `A → B → C` | edges가 모든 노드를 한 번씩 지나는 **하나의 경로**. 시작 노드 1개(진입 0), 끝 노드 1개(진출 0), 나머지는 진입 1·진출 1 |
| `hierarchy` | 트리 | 루트 정확히 1개(진입 0), 나머지 노드는 부모 정확히 1개, 모든 노드가 루트에서 도달 가능(순환 없음) |
| `mindmap` | 중심 + 가지 | `hierarchy` 규칙 + 깊이 ≤ 2 (중심 → 주제 → 세부) |
| `comparison` | 비교 대상 열 + 특징 | 루트(비교 대상) 2~3개, 나머지는 특징 노드로 부모 정확히 1개, 깊이 = 1, 각 비교 대상은 특징 ≥ 1 |

### 파생 함수

- `InfographicSpec.toJsonSchema(supportedTypes)` → Structured Output에 넘길 JSON Schema (Zod → JSON Schema). 구조 불변식은 JSON Schema로 표현할 수 없으므로 `parse`가 사후에 검사한다.
- `defaultFileName(spec)` → `title`에서 파일명에 쓸 수 없는 문자를 제거한 `<title>.png` (빈 값이면 `infographic.png`).

## 역할 경계 (명세서 §15.2)

| LLM이 결정 (Spec에 담김) | Blink가 결정 (Spec에 없음) |
| --- | --- |
| 유형, 제목, 노드와 설명, 연결 | 좌표, 크기, 색상, 폰트, 간격, 아이콘 |

Spec에 색상·좌표 필드가 없다는 것 자체가 "디자인은 Blink가 관리한다"(§17)를 강제한다.
