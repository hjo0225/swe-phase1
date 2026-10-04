# Visualization Domain — Domain Model

## Value Object: InfographicSpec

```ts
type InfographicType = 'process' | 'hierarchy' | 'comparison' | 'mindmap' | 'architecture';

/** architecture 아이콘 18종 (ARCHITECTURE_ICONS). 그림은 Renderer가 lucide 아이콘으로 정한다 */
type ArchitectureIcon =
  | 'user' | 'client' | 'mobile' | 'internet' | 'cdn' | 'load-balancer' | 'gateway' | 'server' | 'container'
  | 'function' | 'database' | 'cache' | 'storage' | 'queue' | 'ai' | 'mail' | 'security' | 'monitoring';

type EdgeMeta = { label?: string; bidirectional?: true };

type InfographicSpec = {
  version: 1;
  type: InfographicType;
  title: string;
  nodes: {
    id: string;
    title: string;
    description?: string;
    group?: string; // architecture: 노드가 든 그룹 id
    icon?: ArchitectureIcon; // architecture
  }[];
  /** 다른 유형은 [from, to]만. architecture는 선 라벨·양방향이 있으면 세 번째 값을 둔다 */
  edges: ([from: string, to: string] | [from: string, to: string, meta: EdgeMeta])[];
  /** architecture 전용: 이름 있는 상자. parent가 없으면 맨 바깥 */
  groups?: { id: string; title: string; parent?: string }[];
  /** 사용자가 끌어다 놓은 카드의 왼쪽 위 좌표 (선택). LLM 스키마에는 없다 */
  positions?: Record<string, { x: number; y: number }>;
};
```

`version`은 architecture를 더한 뒤에도 1이다 — 새 필드는 모두 선택이고, 다른 유형에서는 저장하지 않으므로 기존 4유형의 저장 JSON은 그대로다.

명세서 §15.3 형식에 `version`을 추가했다. Spec은 노트 본문에 영구 저장되므로 형식이 바뀌면 이전 Spec을 읽을 수 있어야 한다.

### 생성

```ts
InfographicSpec.parse(raw: unknown): InfographicSpec   // 실패 시 InfographicSpecError(reason)
```

1. **형식 검증** (Zod) — 필드 타입, 길이
2. **정규화** — 문자열 trim, 중복 edge 제거, `process`의 빈 edges를 노드 순서 체인으로 채움, `positions`는 지금 있는 노드 것만 정수로 남김(없으면 필드 자체를 뺌). architecture가 아니면 `group`·`icon`·`groups`·선 메타를 지운다. architecture에서는 `ARCHITECTURE_ICONS`에 없는 아이콘을 버리고(기본 상자 아이콘으로 그려진다), 빈 라벨·`false` 방향을 지우고(남는 것이 없으면 `[from, to]`), 안에 노드가 하나도 없는(하위 그룹 포함) 그룹을 뺀다
3. **구조 불변식** — 공통 규칙 + 유형별 규칙

같은 함수가 LLM 결과(Main)와 저장된 Spec(Renderer) 모두에 쓰인다. 결과가 같은 Spec이면 멱등이다.

### 공통 규칙

| ID | 규칙 |
| --- | --- |
| BR-VIS-01 | `type` ∈ `SUPPORTED_TYPES` |
| BR-VIS-02 | `title` 1~60자, 노드 `title` 1~40자, `description` 최대 120자. architecture: 그룹 `title` 1~30자, 선 라벨 최대 24자 |
| BR-VIS-03 | 노드 2~16개(architecture는 2~30개), `id`는 비어 있지 않고 유일 |
| BR-VIS-04 | 모든 edge의 양 끝은 존재하는 노드 ID이며, 자기 자신을 가리키지 않는다 |

### 유형별 규칙

| 유형 | 구조 | 규칙 |
| --- | --- | --- |
| `process` | 선형 체인 `A → B → C` | edges가 모든 노드를 한 번씩 지나는 **하나의 경로**. 시작 노드 1개(진입 0), 끝 노드 1개(진출 0), 나머지는 진입 1·진출 1 |
| `hierarchy` | 트리 | 루트 정확히 1개(진입 0), 나머지 노드는 부모 정확히 1개, 모든 노드가 루트에서 도달 가능(순환 없음) |
| `mindmap` | 중심 + 가지 | `hierarchy` 규칙 + 깊이 ≤ 2 (중심 → 주제 → 세부) |
| `comparison` | 비교 대상 열 + 특징 | 루트(비교 대상) 2~3개, 나머지는 특징 노드로 부모 정확히 1개, 깊이 = 1, 각 비교 대상은 특징 ≥ 1 |
| `architecture` | 그룹 속 구성요소 + 자유 연결 | 연결 ≥ 1, 노드 2~30개. 연결은 아무 노드끼리나(여러 선이 한 노드로 모여도 된다). 그룹 ≤ 12개·중첩 ≤ 3단, 그룹 id는 그룹끼리·노드와 겹치지 않고, 부모는 존재하는 그룹이며 순환 없음. 노드의 `group`은 존재하는 그룹. 아이콘은 `ARCHITECTURE_ICONS` 중 하나(아니면 버림), 선 라벨 ≤ 24자 |

### LLM 결과 → 저장 모양 (`VisualizeExecutor`)

Structured Output(strict)은 모든 필드를 채워 보내므로, Main이 `parse` 전에 저장 모양으로 바꾼다.

- 연결 `{from, to, label, bidirectional}` → `[from, to]` 또는 `[from, to, {label?, bidirectional?}]`. 빈 `group`·`parent`, 아이콘 `none`은 뺀다.
- **길이 줄이기**: 선 라벨 24자, 그룹 이름 30자를 넘으면 잘라 `…`로 끝낸다. 조금 긴 라벨 하나로 시각화 전체가 `SHAPE` 실패가 되지 않게 한다 (노드 제목·설명은 줄이지 않는다).
- **그룹 id 바꾸기**: LLM이 노드와 그룹에 번호를 따로 매겨 id가 겹치면(노드 `"1"`, 그룹 `"1"`) 그룹 id를 `"g1"`처럼 바꾸고 노드 `group`·그룹 `parent`의 참조도 함께 바꾼다. 그룹끼리 겹치는 id는 그대로 두어 `parse`가 거절한다.
- **구성요소 목록 다듬기 (모델에 보내기 전)**: 정리된 글의 중첩 목록에서 연결(`A → B`)에도 나오는 항목 아래의 하위 항목을 그 항목 옆(같은 단계)으로 올린다. 그런 항목은 상자이면서 카드여야 해서, 모델이 카드를 빼고 선을 다른 구성요소로 옮기곤 했다. 줄을 지우거나 바꾸지 않는다.
- **목록의 상자 더하기 (architecture)**: 위를 거친 목록에서 하위 항목이 있는 항목은 담기만 하는 것(앱·네트워크·zone)이다. 모델이 그 상자를 빠뜨렸으면 더하고(id `o1`…), 그룹이 없는 카드만 목록대로 넣는다. 모델이 그린 상자·자리는 그대로 두고, 그룹 수·중첩 한도(12개·3단)를 넘기지 않는다. 납작한 목록에는 아무것도 하지 않는다 — 그룹은 선택이다.
- **선이 닿는 것은 카드 (architecture)**: 선이 상자를 가리키면 그 상자를 열어(안의 것은 한 단계 위로) 같은 자리에 같은 이름의 카드를 두고 잇는다. 상자와 이름이 같은 카드는 선이 없으면 빼고, 선이 있으면 카드를 남기고 상자를 연다. 자기 자신을 가리키는 선은 그릴 수 없어 뺀다. 카드와 그릴 수 있는 선은 잃지 않는다. 다른 유형은 지금처럼 `parse`가 거절한다.

### 정리 → 시각화

정리하기(ORGANIZE)는 시스템 구성을 설명하는 글을 `## Components`(들여쓰기 = 안에 든다, 예: VPC › Zone › Subnet › 서버)와 `## Flows`(한 줄에 연결 하나, `A → B: 라벨`, 양방향은 글이 그렇게 말할 때만 `↔`)로 정리한다. 원문에 없는 구성요소·그룹·방향·프로토콜은 만들지 않고, 위치를 말하지 않은 구성요소는 맨 바깥(또는 글이 말한 그룹)에 둔다. 라벨은 선 위로 오가는 것(프로토콜·데이터 종류)만 쓰고 동작("calls")은 쓰지 않는다. 하위 항목은 담기만 하는 것(앱·네트워크·zone)만 갖고, 연결에 나오는 구성요소는 하위 항목을 갖지 않는다(그 안에서 도는 것은 옆에 나란히). 글이 시스템 전체를 하나로 부르고 그 부분을 설명하면 부분은 그 안에 둔다. 구성요소가 쓰는 라이브러리·기술은 이름 뒤 괄호에 적는다("UI (React)"). 글이 말한 중간 단계는 각각 한 줄로 남긴다(A가 B를 거쳐 C로 가면 A → B, B → C). 글이 말한 구성요소는 빠짐없이 적고, 연결의 양 끝은 늘 적힌 구성요소다(키·파일 같은 데이터는 라벨로). 다른 글은 예전처럼 정리한다. 이렇게 정리한 글을 시각화하면 architecture가 고르기 쉬운 모양이 된다.

편집기에서 여러 블록을 선택해 AI 작업을 보내면 제목·목록 표시와 들여쓰기가 남는다(renderer `selectionText`) — 시각화가 정리된 Components의 중첩을 볼 수 있다. 예전에는 글만 보내져 중첩(= 그룹)이 사라졌다.

### 파생 함수

- `InfographicSpec.toJsonSchema(supportedTypes)` → Structured Output에 넘길 JSON Schema (Zod → JSON Schema). 구조 불변식은 JSON Schema로 표현할 수 없으므로 `parse`가 사후에 검사한다.
- `defaultFileName(spec)` → `title`에서 파일명에 쓸 수 없는 문자를 제거한 `<title>.png` (빈 값이면 `infographic.png`).

## 역할 경계 (명세서 §15.2)

| LLM이 결정 (Spec에 담김) | Blink가 결정 (Spec에 없음) |
| --- | --- |
| 유형, 제목, 노드와 설명, 연결. architecture: 그룹과 중첩, 아이콘 **종류**(18종 중), 선 라벨·방향 | 좌표, 크기, 색상, 폰트, 간격, 아이콘 그림(lucide) |

Spec에 색상·좌표 필드가 없다는 것 자체가 "디자인은 Blink가 관리한다"(§17)를 강제한다.

**예외 — 사용자가 옮긴 카드 위치 (`positions`)**: 편집기에서 카드를 끌어 놓으면 그 카드의 좌표만 Spec에 남는다. LLM이 정하는 값이 아니므로 Structured Output 스키마에는 넣지 않는다. 렌더러는 기본 배치를 먼저 계산하고 옮긴 카드만 덮어쓴 뒤, 연결선(나란하면 옆면끼리, 아니면 윗면·아랫면끼리)·comparison 열 배경·캔버스 크기를 실제 위치에 맞춰 다시 잡는다. 카드는 제목 영역과 왼쪽 여백 밖으로는 놓이지 않는다. 저장하는 값은 이런 제한을 모두 거쳐 **실제로 그려진 자리**다 — 다시 열어도 카드가 같은 자리에 있다. "Reset layout"은 `positions`를 지워 기본 배치로 돌아간다.

**architecture 배치**: 기본 배치는 ELK(elkjs `layered`, 왼쪽→오른쪽, 직각 선, 그룹은 중첩 노드, 선 라벨 자리 포함)가 정한다. ELK는 비동기이고 크므로 architecture 블록이 처음 그려질 때만 불러오고, 구조(positions를 뺀 Spec)가 바뀔 때만 다시 돌린다. 옮긴 카드는 positions로 덮어쓰고, 그 카드에 닿는 선만 직각 꺾은선으로 다시 잇고(라벨은 가운데 선분에), 그 카드를 품은 그룹 상자만 내용에 맞게 다시 잡는다(깊은 그룹부터). 그룹 안 카드는 제목 영역·왼쪽 여백에 더해 품은 그룹 수만큼 그룹 이름 자리·안쪽 여백을 비켜 놓인다 — 다시 잡은 그룹 상자가 제목 영역을 덮지 않게 한다. 그룹 상자 끌기·선 경로 직접 꺾기는 하지 않는다.
