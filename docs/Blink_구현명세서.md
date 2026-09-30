# Blink 구현명세서

## 1. 프로젝트 개요

### 1.1 프로젝트명

**Blink**

### 1.2 한 줄 정의

> 사용자가 작성 중인 텍스트를 선택하면 AI가 해당 영역을 구체화·정리·시각화하고, 과거에 작성한 노트를 검색해 현재 노트와 연결할 수 있는 Electron 기반 Local-first AI 노트 앱입니다.

### 1.3 핵심 컨셉

Blink는 단순한 AI 요약 노트 앱이 아닙니다.

사용자가 이미 작성하고 있는 문서를 중심으로 두 가지 작업을 지원합니다.

1. **현재 작성 중인 생각을 발전시킵니다.**
2. **과거에 작성했던 생각을 다시 찾아 연결합니다.**

전체 기능 구조는 다음과 같습니다.

```text
Blink
│
├─ Basic
│   └─ Note CRUD
│
├─ Major 1
│   └─ Selected Text AI Actions
│       ├─ 구체화
│       ├─ 정리
│       └─ 시각화
│
└─ Major 2
    └─ Existing Note Search & Connect
        ├─ 노트 검색
        ├─ 현재 노트에 연결
        └─ 내용 가져오기
```

향후 자연어 기반 의미 검색을 Major 2의 확장 기능으로 제공합니다.

## 2. 문제 정의

기존 노트 작성 과정에서 AI를 활용하려면 일반적으로 다음 과정이 필요합니다.

```text
노트 작성
↓
ChatGPT 또는 다른 AI 서비스 실행
↓
텍스트 복사
↓
Prompt 작성
↓
응답 대기
↓
결과 복사
↓
노트로 복귀
↓
붙여넣기
```

또한 과거에 작성한 내용을 다시 활용하려면 사용자가 직접 파일이나 노트를 탐색해야 합니다.

Blink는 이 두 문제를 현재 작성 화면 안에서 해결합니다.

```text
현재 생각 발전
→ 텍스트 선택
→ 구체화 / 정리 / 시각화

과거 생각 활용
→ 노트 검색
→ 연결 / 내용 가져오기
```

## 3. 프로젝트 목표

Blink의 핵심 목표는 **글쓰기 흐름을 끊지 않고 AI와 기존 지식을 활용하는 노트 작성 환경**을 만드는 것입니다.

구체적인 목표는 다음과 같습니다.

1. 데스크톱에서 빠르게 실행할 수 있는 Local-first 노트 앱을 제공합니다.
2. 노트를 생성·조회·수정·삭제할 수 있습니다.
3. 현재 작성 중인 텍스트 일부에 직접 AI 작업을 실행할 수 있습니다.
4. AI 작업 중 별도의 Loading Modal을 띄우지 않습니다.
5. AI 작업을 Background Job으로 실행합니다.
6. AI 작업이 완료되기 전까지 원문을 변경하지 않습니다.
7. 과거 작성한 노트를 현재 노트에서 바로 검색할 수 있습니다.
8. 기존 노트를 현재 노트와 연결하거나 내용을 가져올 수 있습니다.
9. 사용자가 자신의 LLM API Key와 Model을 설정할 수 있습니다.
10. AI를 이용해 텍스트를 구조화된 인포그래픽으로 변환할 수 있습니다.

# 4. 기능 구성

## 4.1 Basic — Note CRUD

| 기능   | 설명                        |
| ------ | --------------------------- |
| Create | 새로운 노트 작성            |
| Read   | 노트 목록 및 상세 내용 조회 |
| Update | 노트 제목 및 본문 수정      |
| Delete | 노트 삭제                   |

## 4.2 Major 1 — Selected Text AI Actions

텍스트를 선택하면 다음 기능을 제공합니다.

```text
[ 구체화 ] [ 정리 ] [ 시각화 ]
```

| 기능   | 설명                                                 |
| ------ | ---------------------------------------------------- |
| 구체화 | 웹 검색을 통해 관련 정보를 추가 조사하고 내용을 보강 |
| 정리   | 두서없이 작성된 글을 논리적으로 재구성               |
| 시각화 | 내용을 구조적으로 분석해 인포그래픽으로 변환         |

## 4.3 Major 2 — Existing Note Search & Connect

현재 노트를 작성하면서 과거 노트를 검색할 수 있습니다.

검색 결과에 대해 다음 기능을 제공합니다.

```text
[ 노트 연결 ]
[ 내용 가져오기 ]
```

### 노트 연결

현재 노트와 기존 노트 사이에 Reference를 생성합니다.

```text
현재 노트

관련 내용은 [[Electron Architecture]] 참고
```

### 내용 가져오기

과거 노트의 필요한 내용을 현재 노트에 삽입합니다.

```text
기존 노트
↓
필요한 내용 선택
↓
현재 노트에 삽입
```

## 4.4 Optional

Major 2를 다음과 같이 확장할 수 있습니다.

```text
키워드 검색
↓
자연어 의미 검색
```

예:

```text
"전에 Electron main이랑 renderer 차이 적은 노트 찾아줘"
```

검색 결과:

```text
Electron Architecture
Software Engineering Notes
Desktop App Structure
```

Phase 1에서는 기본 제목·본문 검색을 우선 구현하고 의미 검색은 Optional로 둡니다.

# 5. 전체 사용자 흐름

```text
Blink 실행
↓
노트 생성 또는 기존 노트 선택
↓
내용 작성
│
├─────────────────────────────┐
│                             │
▼                             ▼
텍스트 선택                 기존 노트 검색
│                             │
▼                             ▼
Bubble Menu                  검색 결과
│                             │
├─ 구체화                     ├─ 노트 연결
├─ 정리                       └─ 내용 가져오기
└─ 시각화
│
▼
Background AI Job
│
▼
선택 영역 Pulse
│
▼
완료 후 Commit
```

# 6. Note CRUD

## 6.1 Create

새로운 노트를 생성합니다.

```text
title
content
```

저장 데이터:

```text
id
title
content
createdAt
updatedAt
```

## 6.2 Read

노트 목록과 상세 내용을 조회합니다.

노트 목록:

- 제목
- 최근 수정 시간
- 본문 Preview

## 6.3 Update

노트 수정 시 자동 저장합니다.

```text
텍스트 입력
↓
500~1000ms Debounce
↓
SQLite 저장
```

## 6.4 Delete

노트를 삭제합니다.

사용자 실수를 방지하기 위해 삭제 전 Confirm Dialog를 표시합니다.

# 7. Editor

Blink의 Editor는 **Tiptap**을 사용합니다.

필요 기능:

```text
Rich Text Editing
Text Selection
Bubble Menu
Custom Extension
Decoration
Selection Lock
Internal Note Link
```

기본 레이아웃:

```text
┌───────────────┬────────────────────────────────┐
│ Blink         │                                │
│               │                                │
│ + New Note    │          Note Editor           │
│               │                                │
│ Note A        │                                │
│ Note B        │                                │
│ Note C        │                                │
│               │                                │
│ Search        │                                │
│ Settings      │                                │
└───────────────┴────────────────────────────────┘
```

# 8. Major 1 — Selected Text AI Actions

## 8.1 Text Selection

사용자가 텍스트를 Drag합니다.

```text
Electron은 데스크톱 애플리케이션을 만드는 프레임워크다.
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

선택 영역 위에 Bubble Menu를 표시합니다.

```text
       ┌────────────────────────────┐
       │ 구체화   정리   시각화     │
       └────────────────────────────┘
```

AI 기능을 선택하면 Bubble Menu는 즉시 사라집니다.

# 9. AI Processing Interaction

## 9.1 Loading Modal 사용 금지

다음 형태의 Loading Modal은 사용하지 않습니다.

```text
┌───────────────────┐
│ AI 작업 중...      │
│        ⟳          │
└───────────────────┘
```

AI가 작업 중인 **텍스트 영역 자체를 상태 표시기**로 사용합니다.

## 9.2 Pulse Animation

선택한 영역이 밝아졌다 흐려지는 효과를 반복합니다.

```text
Opacity

1.0
↓
0.4
↓
1.0
↓
반복
```

기본 구현:

```css
.ai-processing {
  animation: blink-processing 1.4s ease-in-out infinite;
}

@keyframes blink-processing {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}
```

필요하면 약한 Background Color Animation을 함께 적용합니다.

## 9.3 Blink 브랜드와 인터랙션

```text
Select
↓
Blink
↓
Transform
```

서비스 이름인 Blink와 실제 Processing Interaction을 직접 연결합니다.

# 10. Selection Lock

AI가 작업 중인 영역만 일시적으로 편집할 수 없게 합니다.

```text
편집 가능 영역

[ AI PROCESSING ]

편집 가능 영역
```

다른 문장이나 다른 노트는 계속 수정할 수 있습니다.

이 기능은 AI 요청 시점의 Input Snapshot과 실제 적용 위치의 일관성을 유지하기 위한 것입니다.

# 11. Background AI Job

AI 작업은 Renderer에서 직접 실행하지 않고 Job으로 생성합니다.

```ts
AIJob {
  id
  noteId

  type
  status

  selectionFrom
  selectionTo

  inputText

  resultText
  resultData

  errorMessage

  createdAt
  startedAt
  completedAt
}
```

## 11.1 Job Type

```text
EXPAND
ORGANIZE
VISUALIZE
```

## 11.2 Job Status

```text
QUEUED
↓
RUNNING
↓
COMPLETED
```

실패:

```text
RUNNING
↓
FAILED
```

# 12. Atomic AI Processing

AI 응답을 Streaming 형태로 Editor에 바로 입력하지 않습니다.

## 잘못된 방식

```text
AI 첫 토큰
↓
Editor 수정
↓
다음 토큰
↓
Editor 수정
↓
도중 오류
```

이 경우 불완전한 문장이 남을 수 있습니다.

## Blink 방식

```text
Input Snapshot
↓
AI Job
↓
Processing
↓
Validation
↓
SUCCESS
↓
Commit
```

작업 실패:

```text
FAILED
↓
기존 원문 유지
```

사용자 관점에서는 하나의 AI 요청을 하나의 Atomic Operation처럼 처리합니다.

# 13. 구체화

## 13.1 목적

선택한 내용을 단순히 길게 만드는 것이 아니라 필요한 정보를 웹에서 추가 조사하여 내용의 밀도와 구체성을 높입니다.

예:

```text
Electron은 데스크톱 앱을 만드는 프레임워크다.
```

처리:

```text
텍스트 분석
↓
Research Intent 파악
↓
Web Search
↓
Source 수집
↓
LLM Context 구성
↓
재작성
↓
Validation
```

결과:

```text
Electron은 Chromium과 Node.js를 기반으로 HTML,
CSS, JavaScript를 이용하여 Windows, macOS, Linux용
데스크톱 애플리케이션을 개발할 수 있도록 하는
프레임워크입니다.

Electron 애플리케이션은 일반적으로 Main Process와
Renderer Process를 중심으로 구성됩니다.
```

## 13.2 Pipeline

```text
Selected Text
↓
Research Analysis
↓
Web Search
↓
Source Collection
↓
LLM Generation
↓
Validation
↓
Commit
```

## 13.3 필요 Capability

```text
Text Generation
Web Search
```

Web Search를 지원하지 않는 모델에서는 구체화 기능을 비활성화합니다.

# 14. 정리

## 14.1 목적

사용자가 빠르게 작성한 메모를 의미는 그대로 유지하면서 읽기 좋은 구조로 변경합니다.

입력:

```text
회의했고 api 어떤거 쓸지도 얘기했고
electron 쓸 거 같고 db sqlite 쓰고
다음주까지 개발하기로 함
```

출력:

```markdown
## 프로젝트 회의 결과

### 기술 스택

- Desktop: Electron
- Database: SQLite
- AI: 사용자 지정 LLM API

### 일정

- 다음 주까지 MVP 구현
```

## 14.2 Pipeline

```text
Selected Text
↓
Structure Analysis
↓
Rewrite
↓
Validation
↓
Commit
```

Web Search는 사용하지 않습니다.

# 15. 시각화

## 15.1 목적

선택한 내용을 사람이 빠르게 이해할 수 있는 인포그래픽으로 변환합니다.

생성형 이미지 모델은 사용하지 않습니다.

```text
Text
↓
LLM
↓
InfographicSpec
↓
Renderer
↓
SVG
↓
PNG
```

## 15.2 역할 분리

| LLM              | Blink         |
| ---------------- | ------------- |
| 핵심 개념 추출   | Layout        |
| 관계 파악        | 색상          |
| 시각화 유형 선택 | Typography    |
| 정보 계층 판단   | SVG Rendering |
| 노드/연결 정의   | PNG Export    |

## 15.3 InfographicSpec

```json
{
  "type": "process",
  "title": "Blink AI 처리 과정",
  "nodes": [
    {
      "id": "1",
      "title": "노트 작성",
      "description": "사용자가 내용을 작성"
    },
    {
      "id": "2",
      "title": "AI 처리",
      "description": "선택 영역 분석"
    },
    {
      "id": "3",
      "title": "결과",
      "description": "결과 생성"
    }
  ],
  "edges": [
    ["1", "2"],
    ["2", "3"]
  ]
}
```

# 16. Visualization Type

Phase 1에서는 다음 네 가지 구조를 기준으로 합니다.

```text
process
hierarchy
comparison
mindmap
```

## Process

```text
A → B → C → D
```

## Hierarchy

```text
       A
      / \
     B   C
    / \
   D   E
```

## Comparison

```text
A                     B

특징 1                특징 1
특징 2                특징 2
```

## Mindmap

```text
         B
         │
C ────── A ────── D
         │
         E
```

# 17. Visualization Renderer

```text
InfographicSpec
↓
VisualizationRenderer
│
├─ ProcessRenderer
├─ HierarchyRenderer
├─ ComparisonRenderer
└─ MindmapRenderer
↓
SVG
```

AI에게 HTML이나 CSS 디자인을 직접 생성하게 하지 않습니다.

디자인은 Blink가 관리합니다.

# 18. Visualization Design System

예:

```text
Palette

Blue
Purple
Green
Orange
Pink
Teal
```

공통 규칙:

```text
Node Radius       12px
Node Padding      16px
Node Gap          24px
Title Weight      700
Body Weight       400
```

동일한 Visualization Type은 언제 생성해도 일관된 디자인을 사용합니다.

# 19. PNG Export

```text
InfographicSpec
↓
SVG
↓
Preview
↓
Canvas
↓
PNG
↓
Save Dialog
```

사용자가 PNG 파일 저장 위치를 선택합니다.

# 20. Major 2 — Existing Note Search & Connect

## 20.1 목적

현재 작성 중인 내용과 관련된 과거 노트를 빠르게 찾아 현재 문서의 Context로 활용할 수 있도록 합니다.

Blink 내부에서 검색부터 연결까지 모두 수행합니다.

## 20.2 검색 UI

단축키 또는 Search 버튼을 실행합니다.

```text
┌─────────────────────────────────┐
│ Search Notes                    │
│ [ electron architecture      ]  │
├─────────────────────────────────┤
│ Electron Architecture           │
│ Main Process와 Renderer...      │
│                                 │
│        [연결] [내용 가져오기]    │
├─────────────────────────────────┤
│ Software Engineering            │
│ Electron 기반 앱에서는...       │
│                                 │
│        [연결] [내용 가져오기]    │
└─────────────────────────────────┘
```

# 21. 기본 검색

Phase 1에서는 SQLite 기반 Keyword Search를 사용합니다.

검색 대상:

```text
Note.title
Note.content
```

개념적으로:

```sql
WHERE title LIKE '%keyword%'
   OR content LIKE '%keyword%'
```

검색 결과에는 다음을 표시합니다.

```text
Note Title
Matched Content Preview
Updated At
```

# 22. 노트 연결

검색 결과의 노트를 현재 노트에 Reference 형태로 연결합니다.

예:

```text
관련 아키텍처는 [[Electron Architecture]] 참고
```

클릭하면 해당 노트로 이동합니다.

## 22.1 NoteLink

노트 간 관계를 DB에도 저장합니다.

```text
NoteLink

id
sourceNoteId
targetNoteId
createdAt
```

예:

```text
현재 노트 A
      │
      │ references
      ▼
기존 노트 B
```

# 23. 내용 가져오기

검색 결과에서 기존 노트의 내용을 현재 노트로 가져올 수 있습니다.

### 전체 내용 가져오기

```text
기존 Note
↓
Insert Content
↓
현재 Note
```

### 필요한 부분만 가져오기

검색 결과 Preview 또는 노트 상세 화면에서 필요한 문단을 선택합니다.

```text
기존 Note

[선택 영역]

↓ 가져오기

현재 Note
```

삽입 위치는 현재 Cursor 위치를 기본으로 사용합니다.

# 24. Major 2 Optional — 자연어 검색

Phase 1 이후 기존 Keyword Search를 Semantic Search로 확장할 수 있습니다.

예:

```text
"전에 Electron 프로세스 구조 적어놓은 거 찾아줘"
```

구현 구조:

```text
Note
↓
Embedding
↓
Vector 저장

Query
↓
Query Embedding
↓
Similarity Search
↓
Relevant Notes
```

향후 적용 가능한 방식:

```text
SQLite Vector Extension
Local Embedding Model
External Embedding API
```

Phase 1에서는 구현하지 않습니다.

# 25. Major 1과 Major 2의 관계

Blink의 두 Major Feature는 서로 다른 문제를 해결합니다.

```text
Major 1
현재 작성 중인 생각을 발전

Major 2
과거에 작성한 생각을 다시 활용
```

전체 사용자 지식 흐름은:

```text
과거 Note
    │
    │ Major 2
    ▼
현재 Note
    │
    │ Major 1
    ▼
구체화 / 정리 / 시각화
```

즉 Blink는 단순한 AI Writer가 아니라 **사용자의 현재 생각과 기존 지식을 연결하는 작성 환경**을 지향합니다.

# 26. AI Provider 설정

사용자가 자신의 API Key를 등록합니다.

Phase 1 Provider:

```text
OpenAI
Kimi
```

초기 기준 구현은 OpenAI를 우선합니다.

설정 화면:

```text
Settings > AI

Provider
[ OpenAI ▼ ]

API Key
[ ••••••••••••• ]

Model
[ Model ▼ ]

Capabilities

✓ Text Generation
✓ Structured Output
✓ Web Search

[ Test Connection ]
```

# 27. Capability 기반 모델 관리

```ts
interface ModelCapabilities {
  generate: boolean;
  structuredOutput: boolean;
  webSearch: boolean;
}
```

예:

```text
Text Generation       ✓
Structured Output     ✓
Web Search            ✕
```

이 경우:

```text
[ 구체화 🔒 ] [ 정리 ] [ 시각화 ]
```

구체화는 사용할 수 없습니다.

# 28. Provider Adapter

AI Provider에 따라 핵심 애플리케이션 로직이 변경되지 않도록 Adapter Pattern을 사용합니다.

```ts
interface LLMProvider {
  testConnection(): Promise<boolean>;

  generate(request: GenerateRequest): Promise<GenerateResult>;

  getCapabilities(): ModelCapabilities;

  searchAndGenerate?(request: ResearchRequest): Promise<ResearchResult>;
}
```

구조:

```text
LLMProvider
│
├─ OpenAIProvider
└─ KimiProvider
```

향후:

```text
GeminiProvider
OpenRouterProvider
LocalLLMProvider
```

를 추가할 수 있습니다.

# 29. API Key 보안

API Key를 Plain Text로 저장하지 않습니다.

```text
API Key
↓
Electron safeStorage
↓
Encrypt
↓
Local Storage
```

사용:

```text
Encrypted API Key
↓
Decrypt
↓
Main Process
↓
Provider
```

Renderer Process에는 API Key를 전달하지 않습니다.

# 30. 시스템 아키텍처

```text
┌──────────────────────────────────────────────┐
│                    Blink                     │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Renderer Process                         │ │
│ │                                          │ │
│ │ React                                    │ │
│ │ Tiptap                                   │ │
│ │ Bubble Menu                              │ │
│ │ Search UI                                │ │
│ │ Job Decoration                           │ │
│ │ Visualization Preview                    │ │
│ └───────────────────┬──────────────────────┘ │
│                     │ IPC                    │
│ ┌───────────────────▼──────────────────────┐ │
│ │ Main Process                             │ │
│ │                                          │ │
│ │ Job Manager                              │ │
│ │ Provider Manager                         │ │
│ │ Note Search                              │ │
│ │ Note Link Manager                        │ │
│ │ Database                                 │ │
│ │ File System                              │ │
│ │ API Key Manager                          │ │
│ └───────────────────┬──────────────────────┘ │
│                     │                        │
└─────────────────────┼────────────────────────┘
                      │ HTTPS
               ┌──────▼──────┐
               │ External AI │
               │             │
               │ OpenAI      │
               │ Kimi        │
               └─────────────┘
```

# 31. Electron Process 구조

```text
Electron

├─ Main Process
├─ Preload
└─ Renderer Process
```

## Renderer

담당:

```text
UI
Editor
Search UI
Bubble Menu
Pulse Animation
Visualization Preview
```

## Main Process

담당:

```text
SQLite
AI Job
Provider
Note Search
Note Links
File System
API Key
PNG Export
```

## Preload

Renderer가 사용할 수 있는 최소한의 안전한 API를 제공합니다.

# 32. IPC 설계

## Note

```text
note:create
note:list
note:get
note:update
note:delete
```

## Search

```text
note:search
note:get-preview
```

## Note Link

```text
note-link:create
note-link:list
note-link:delete
```

## AI

```text
ai:create-job
ai:get-job
ai:retry-job
```

## Settings

```text
settings:get-provider
settings:update-provider
settings:test-provider
```

## Visualization

```text
visualization:save-png
```

# 33. Context Bridge

Renderer에 Node.js 전체 API를 노출하지 않습니다.

```ts
window.blink.notes.create();
window.blink.notes.search();
window.blink.notes.link();
window.blink.notes.insertContent();

window.blink.ai.createJob();
window.blink.ai.retryJob();

window.blink.settings.saveProvider();

window.blink.visualization.savePNG();
```

# 34. Database Schema

## Note

```text
Note

id
title
content
createdAt
updatedAt
```

## NoteLink

```text
NoteLink

id
sourceNoteId
targetNoteId
createdAt
```

## AIJob

```text
AIJob

id
noteId

type
status

selectionFrom
selectionTo

inputText

resultText
resultData

errorMessage

createdAt
startedAt
completedAt
```

## AIProviderSetting

```text
AIProviderSetting

id
provider
baseUrl
encryptedApiKey
model
createdAt
updatedAt
```

## Visualization

```text
Visualization

id
noteId
jobId

type
specJson
svg

createdAt
```

# 35. 기술 스택

| 영역                 | 기술                                 |
| -------------------- | ------------------------------------ |
| Desktop Framework    | **Electron**                         |
| Programming Language | **TypeScript**                       |
| UI Framework         | **React**                            |
| Build Tool           | **Vite**                             |
| Editor               | **Tiptap / ProseMirror**             |
| Local Database       | **SQLite**                           |
| ORM                  | **Drizzle ORM**                      |
| AI Provider          | **OpenAI API / Kimi API**            |
| AI Architecture      | **Provider Adapter Pattern**         |
| Web Search           | Provider Native Web Search           |
| Async AI Processing  | **Custom Job Manager**               |
| IPC                  | **Electron IPC + contextBridge**     |
| Validation           | **Zod**                              |
| Visualization        | **SVG Custom Renderer**              |
| Visualization Schema | **InfographicSpec JSON**             |
| PNG Export           | **SVG → Canvas → PNG**               |
| API Key Protection   | **Electron safeStorage**             |
| Note Search          | **SQLite Keyword Search**            |
| Note Relation        | **NoteLink Table**                   |
| Package Manager      | pnpm 또는 npm                        |
| Packaging            | Electron Forge 또는 electron-builder |

# 36. 기술 선택 이유

## Electron

Blink는 언제든 빠르게 실행할 수 있는 Desktop Note App을 목표로 합니다.

Electron을 사용하면 하나의 TypeScript/JavaScript 코드베이스에서 Desktop UI, SQLite, File System, API 연동을 처리할 수 있습니다.

## React

Sidebar, Editor, Search, Settings, Visualization 등 UI를 Component 단위로 관리합니다.

## TypeScript

다음 핵심 Domain을 안전하게 공유하기 위해 사용합니다.

```text
Note
NoteLink
AIJob
LLMProvider
ModelCapabilities
InfographicSpec
```

## Tiptap / ProseMirror

Blink의 핵심 UX인:

```text
Text Selection
Bubble Menu
Decoration
Selection Lock
Internal Link
```

구현에 사용합니다.

## SQLite

Local-first 앱이므로 별도의 Backend Database Server가 필요하지 않습니다.

사용자의 데이터는 기본적으로 사용자 PC에 저장합니다.

## Drizzle ORM

TypeScript와 SQLite Schema를 간결하게 연결합니다.

## Zod

LLM의 Structured Output을 검증합니다.

특히:

```text
LLM
↓
InfographicSpec
↓
Zod
↓
Renderer
```

구조에서 잘못된 데이터가 Renderer까지 들어가는 것을 방지합니다.

## SVG

인포그래픽의 디자인을 앱이 직접 제어할 수 있습니다.

장점:

```text
Resolution Independent
Design Consistency
Easy Layout Control
PNG Export 가능
```

# 37. 권장 프로젝트 구조

```text
blink/

├─ src/
│
│  ├─ main/
│  │
│  ├─ ipc/
│  │  │  ├─ note.ipc.ts
│  │  │  ├─ search.ipc.ts
│  │  │  ├─ ai.ipc.ts
│  │  │  └─ settings.ipc.ts
│  │
│  │  ├─ jobs/
│  │  │  ├─ job-manager.ts
│  │  │  ├─ expand.job.ts
│  │  │  ├─ organize.job.ts
│  │  │  └─ visualize.job.ts
│  │
│  │  ├─ ai/
│  │  │  ├─ provider.ts
│  │  │  ├─ provider-manager.ts
│  │  │  ├─ openai.provider.ts
│  │  │  └─ kimi.provider.ts
│  │
│  │  ├─ notes/
│  │  │  ├─ note-service.ts
│  │  │  ├─ note-search.ts
│  │  │  └─ note-link.ts
│  │
│  │  ├─ database/
│  │  │  ├─ db.ts
│  │  │  ├─ schema.ts
│  │  │  └─ repositories/
│  │
│  │  ├─ security/
│  │  │  └─ api-key.ts
│  │
│  │  └─ visualization/
│  │     └─ export.ts
│  │
│  ├─ preload/
│  │  └─ index.ts
│  │
│  ├─ renderer/
│  │
│  │  ├─ components/
│  │  │  ├─ Sidebar.tsx
│  │  │  ├─ NoteList.tsx
│  │  │  ├─ NoteEditor.tsx
│  │  │  ├─ NoteSearch.tsx
│  │  │  ├─ AIActionBubble.tsx
│  │  │  └─ Settings.tsx
│  │
│  │  ├─ editor/
│  │  │  ├─ editor.ts
│  │  │  └─ extensions/
│  │  │     ├─ ai-job-decoration.ts
│  │  │     ├─ selection-lock.ts
│  │  │     └─ note-link.ts
│  │
│  │  ├─ visualization/
│  │  │  ├─ VisualizationRenderer.tsx
│  │  │  ├─ ProcessRenderer.tsx
│  │  │  ├─ HierarchyRenderer.tsx
│  │  │  ├─ ComparisonRenderer.tsx
│  │  │  └─ MindmapRenderer.tsx
│  │
│  │  └─ pages/
│  │     ├─ EditorPage.tsx
│  │     └─ SettingsPage.tsx
│  │
│  └─ shared/
│     ├─ types/
│     └─ schemas/
│
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

# 38. 구현 순서

## Step 1. Electron 기본 환경

```text
Electron
+
React
+
TypeScript
+
Vite
```

## Step 2. Note CRUD

```text
Create
Read
Update
Delete
```

SQLite와 연결합니다.

## Step 3. Tiptap Editor

노트 작성과 자동 저장 기능을 구현합니다.

## Step 4. Major 2 기본 검색

```text
Search
↓
Title / Content
↓
Results
```

기존 노트를 검색할 수 있도록 합니다.

## Step 5. Note Link / Content Insert

검색 결과에서:

```text
[연결]
[내용 가져오기]
```

를 구현합니다.

## Step 6. Major 1 Bubble Menu

```text
Text Select
↓
구체화 / 정리 / 시각화
```

## Step 7. AI Settings

```text
Provider
API Key
Model
Connection Test
```

## Step 8. 정리 기능

```text
Selection
↓
LLM
↓
Result
```

가장 단순한 AI 기능부터 구현합니다.

## Step 9. Job Manager

```text
Selection
↓
Job 생성
↓
Pulse
↓
Background Processing
↓
Commit
```

## Step 10. Selection Lock

AI 처리 중인 영역만 수정하지 못하도록 합니다.

## Step 11. 구체화

Web Search와 연결합니다.

## Step 12. 시각화

```text
Text
↓
InfographicSpec
↓
SVG
```

## Step 13. PNG Export

인포그래픽을 PNG로 저장합니다.

## Step 14. Kimi Adapter

OpenAI Provider 구현 이후 Kimi를 추가합니다.

# 39. Phase 1 필수 구현 범위

## Basic

- [ ] Note Create
- [ ] Note Read
- [ ] Note Update
- [ ] Note Delete
- [ ] Auto Save

## Major 1

- [ ] Text Selection
- [ ] Bubble Menu
- [ ] 정리
- [ ] 구체화
- [ ] 시각화
- [ ] Background Job
- [ ] Pulse Animation
- [ ] Selection Lock
- [ ] Atomic Commit

## Major 2

- [ ] 기존 노트 검색
- [ ] 제목 검색
- [ ] 본문 검색
- [ ] Search Result Preview
- [ ] Note Link
- [ ] 현재 노트에 내용 가져오기

## AI Settings

- [ ] Provider 설정
- [ ] API Key 설정
- [ ] Model 설정
- [ ] Capability 관리
- [ ] Connection Test
- [ ] API Key 암호화

## Visualization

- [ ] InfographicSpec
- [ ] Zod Validation
- [ ] Process Renderer
- [ ] 최소 1개 이상의 추가 Renderer
- [ ] SVG Preview
- [ ] PNG Export

# 40. Optional / 후순위

Phase 1에서는 다음 기능을 구현하지 않아도 됩니다.

```text
Semantic Note Search

Embedding 기반 검색

Local LLM

OpenRouter

Gemini

AI 결과 Version History

Cloud Sync

여러 Notebook / Folder

사용자 Custom Prompt

여러 Visualization Theme

App 완전 종료 후 Job Resume

복수 AI Job Queue 제어

Plugin System
```

# 41. MVP 완료 시나리오

## Scenario 1 — CRUD

```text
Blink 실행
↓
노트 생성
↓
내용 작성
↓
자동 저장
↓
앱 종료
↓
재실행
↓
기존 노트 유지
```

## Scenario 2 — Major 1 정리

```text
텍스트 선택
↓
정리
↓
선택 영역 Pulse
↓
사용자는 다른 부분 계속 작성
↓
AI 작업 완료
↓
결과 한 번에 적용
```

## Scenario 3 — Major 1 구체화

```text
텍스트 선택
↓
구체화
↓
Web Search
↓
관련 정보 수집
↓
재작성
↓
Commit
```

## Scenario 4 — Major 1 시각화

```text
텍스트 선택
↓
시각화
↓
InfographicSpec
↓
SVG
↓
Preview
↓
PNG 저장
```

## Scenario 5 — Major 2 검색

```text
현재 노트 작성
↓
Search 실행
↓
키워드 입력
↓
기존 노트 검색
↓
관련 Note 확인
```

## Scenario 6 — Major 2 연결

```text
검색 결과
↓
노트 연결
↓
현재 Note에 Reference 생성
↓
Reference 클릭
↓
기존 Note 이동
```

## Scenario 7 — Major 2 내용 가져오기

```text
검색 결과
↓
기존 Note 선택
↓
내용 가져오기
↓
현재 Cursor 위치에 삽입
```

## Scenario 8 — AI Provider

```text
Settings
↓
API Key 입력
↓
Model 선택
↓
Connection Test
↓
AI 기능 사용
```

# 42. 최종 서비스 구조

```text
                         Blink
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
     Basic              Major 1             Major 2
       │                   │                   │
   Note CRUD          AI Transformation     Note Context
       │                   │                   │
 ┌─────┼──────┐      ┌─────┼─────┐        ┌────┼─────┐
 │     │      │      │     │     │        │          │
Create Read Update  구체화  정리  시각화    검색        연결
       │             │     │     │        │          │
     Delete        Search Rewrite SVG    Keyword   NoteLink
                                      │
                                  내용 가져오기
```

# 43. 서비스 핵심 차별점

Blink의 차별점은 단순히 AI 기능이 있다는 것이 아닙니다.

첫 번째 차별점은 **AI 작업이 현재 작성 환경에 직접 통합되어 있다는 것**입니다.

```text
Write
↓
Select
↓
Blink
↓
Clearer
```

사용자는 별도의 AI Chat UI로 이동하지 않아도 됩니다.

두 번째 차별점은 **현재 생각뿐 아니라 과거 자신의 생각까지 현재 작성 문맥으로 다시 가져올 수 있다는 것**입니다.

```text
Past Notes
     ↓
Search & Connect
     ↓
Current Note
     ↓
AI Transform
```

따라서 Blink는 단순한 AI Writer보다 **개인 지식의 작성·발전·재사용을 하나의 작업 흐름으로 연결하는 데스크톱 노트 앱**을 목표로 합니다.

# 44. 최종 구현 정의

> **Blink는 Electron, React, Tiptap, SQLite를 기반으로 구현되는 Local-first 데스크톱 노트 애플리케이션입니다. 기본적인 Note CRUD를 제공하며, Major 1에서는 사용자가 선택한 텍스트를 Background AI Job으로 구체화·정리·시각화합니다. AI가 작업 중인 영역은 별도의 Loading Modal 대신 Pulse Animation으로 상태를 표현하며, 작업 전체가 성공했을 때만 결과를 한 번에 Commit합니다. Major 2에서는 사용자가 과거에 작성한 노트를 제목과 본문을 기준으로 검색하고, 현재 노트와 연결하거나 기존 내용을 가져올 수 있습니다. OpenAI 및 Kimi 등의 LLM은 Provider Adapter를 통해 연결하며 사용자가 자신의 API Key와 Model을 직접 설정할 수 있도록 구성합니다.**
