# 00. Overview

## 목적

Blink는 **Electron 기반 Local-first AI 노트 앱**이다. 제품 요구사항 원문은 [Blink_구현명세서.md](Blink_구현명세서.md)이며, 이 `docs/` 디렉터리의 나머지 문서는 그 요구사항을 **백엔드(Electron Main Process) 설계**로 옮긴 SSOT다.

- 요구사항(무엇을) → `Blink_구현명세서.md`
- 설계(어떻게, 누가 책임지는가) → `docs/00~05`, `docs/<domain>/`
- 둘이 충돌하면 아래 [설계 결정](#설계-결정-명세서-대비)에 기록된 쪽이 우선한다. 기록되지 않은 충돌은 버그다.

## 용어

| 용어 | 의미 |
| --- | --- |
| Backend | Electron **Main Process**. SQLite, AI 호출, 파일 시스템, API Key를 다룬다. 별도 서버는 없다. |
| API | Renderer ↔ Main 간 **IPC 계약** (`window.blink.*`). HTTP API는 없다. |
| Renderer | React + Tiptap UI. 편집기 상태(ProseMirror document)의 유일한 작성자. |
| Note | 사용자가 작성하는 문서. 제목 + 본문(ProseMirror JSON). |
| Note Link | 노트 본문 안의 `[[다른 노트]]` 참조. 본문에서 파생되는 관계. |
| AI Job | 선택 텍스트에 대한 AI 변환 1건(구체화/정리/시각화). 백그라운드 실행. |
| Pending Mark | AI Job이 처리 중인 텍스트 범위를 표시·잠그는 편집기 Mark. `jobId`를 가진다. |
| Commit | 완료된 AI Job 결과를 Pending Mark 범위에 한 번에 적용하는 행위. |
| InfographicSpec | LLM이 생성하는 인포그래픽 구조 JSON. 디자인은 Blink가 결정한다. |
| Capability | 모델이 지원하는 기능(`generate`, `structuredOutput`, `webSearch`). |

## 비즈니스 목표 → 설계 원칙

| 목표 (명세서 §3) | 설계 원칙 |
| --- | --- |
| 글쓰기 흐름을 끊지 않는다 | AI 작업은 Main의 Job Runner가 비동기로 수행하고, 결과는 이벤트로 푸시한다. Modal 없음. |
| 완료 전 원문 불변 (Atomic) | Main은 **검증을 통과한 결과만** `COMPLETED`로 만든다. 적용은 Renderer가 한 트랜잭션으로 수행한다. |
| Local-first | 모든 데이터는 사용자 PC의 SQLite 한 파일. 외부로 나가는 것은 LLM 호출뿐. |
| 사용자 소유 API Key | Key는 Main에서만 복호화되며 Renderer로 절대 전달되지 않는다. |
| Provider 교체 가능 | 도메인/애플리케이션은 `LLMProvider` 포트에만 의존한다. |

## 도메인 한눈에 보기

자세한 내용은 [03-domain-map.md](03-domain-map.md).

| 도메인 | 담당 기능 (명세서) |
| --- | --- |
| [note](note/overview.md) | Basic(Note CRUD), Major 2(검색·연결·내용 가져오기) |
| [assist](assist/overview.md) | Major 1(구체화·정리·시각화 Job, Selection Lock, Atomic Commit) |
| [ai-provider](ai-provider/overview.md) | AI Settings(Provider, API Key, Model, Capability, 연결 테스트) |
| [visualization](visualization/overview.md) | InfographicSpec 규칙, PNG Export |

## 설계 결정 (명세서 대비)

명세서와 다르게 설계한 부분과 그 이유다. 구현은 이 표를 따른다.

| ID | 결정 | 명세서 | 이유 |
| --- | --- | --- | --- |
| D-01 | 노트 본문은 **ProseMirror JSON**으로 저장하고, 검색·미리보기용 `plainText`는 Main이 저장 시 파생한다. | §6, §34 (`content`) | 링크·Pending Mark·인포그래픽 노드를 무손실 보존해야 한다. LIKE 검색은 JSON이 아니라 텍스트에 해야 한다. |
| D-02 | **NoteLink는 본문의 링크 노드에서 파생**된다. 노트 저장 시 링크 집합을 재계산한다. `note-link:create/delete` IPC는 두지 않는다. | §22.1, §32 | 본문의 `[[링크]]`와 DB 행을 따로 쓰면 반드시 어긋난다(링크 텍스트를 지워도 행이 남음). 진실은 본문 하나. |
| D-03 | AI Job의 적용 위치는 `selectionFrom/To`가 아니라 **본문에 저장되는 Pending Mark(`jobId`)** 로 식별한다. | §11 | 위치 숫자는 편집 중 계속 바뀐다. Mark는 편집·노트 전환·앱 재시작 후에도 따라간다. |
| D-04 | **노트 본문의 유일한 작성자는 Renderer 편집기**다. Main은 AI 결과를 노트에 직접 쓰지 않는다. | §12 | 두 작성자가 생기면 자동 저장과 경합한다. 단일 작성자면 동시성 문제가 사라진다. |
| D-05 | 시각화 결과(InfographicSpec)는 본문의 **infographic 노드 속성에 포함**된다. `Visualization` 테이블과 SVG 저장은 두지 않는다. | §34 | SVG는 Spec에서 결정적으로 렌더링되므로 중복 데이터다. 노드에 포함하면 내용 가져오기·삭제 시 고아 레코드가 없다. |
| D-06 | IPC는 예외를 던지지 않고 **Result Envelope** `{ ok, data \| error }`를 반환한다. | §32 | Electron `invoke`는 에러의 커스텀 속성(code)을 직렬화 과정에서 버린다. |
| D-07 | 앱 시작 시 `QUEUED/RUNNING` Job은 `FAILED(INTERRUPTED)`로 전환한다. | §40 (Resume 후순위) | 재개하지 않는다는 결정을 명시적 상태로 표현한다. 사용자는 재시도할 수 있다. |
| D-08 | `safeStorage`를 사용할 수 없는 환경에서는 API Key 저장을 **거부**한다(평문 폴백 없음). | §29 | "평문 저장 금지" 요구사항을 조용히 깨지 않기 위함. |
| D-09 | `note:get-preview`는 두지 않는다. 검색 결과에 매칭 스니펫을 포함하고, 상세는 `note:get`으로 조회한다. | §32 | 같은 목적의 채널 중복 제거. |
| D-10 | **AI Job ID는 Renderer가 생성**한다. `ai:create-job`은 이 ID 기준으로 멱등이다. | §11 | Pending Mark를 요청 전에 걸어야 스냅샷과 잠금 범위 사이에 편집이 끼어들지 않는다. 그 시점에 ID가 필요하다. |
| D-11 | `InfographicSpec` 코드는 `src/shared`의 **Shared Kernel**로 Main과 Renderer가 함께 쓴다. LLM에 허용하는 유형은 구현된 Renderer 유형으로 제한한다. | §15, §39 | 같은 검증 규칙을 두 번 구현하지 않기 위함. 그릴 수 없는 유형이 생성되는 것을 막기 위함. |

## 제품 결정 (확정: 2026-09-30)

명세서에서 모호했던 부분에 대한 사용자 결정이다. 바뀌면 참조하는 문서(`Q-0x` 검색)를 함께 갱신한다.

| ID | 질문 | 결정 |
| --- | --- | --- |
| Q-01 | 시각화는 선택 텍스트를 **대체**하는가, 아래에 **삽입**하는가? | 원문 유지 + 선택 범위 바로 아래에 인포그래픽 블록 삽입 |
| Q-02 | 구체화 결과의 출처 표기 방식은? | 결과 끝에 `출처` 목록(제목 + URL) 추가, 출처 0건이면 실패 |
| Q-03 | 노트 삭제는 즉시 삭제인가, 휴지통인가? | 즉시 삭제(Hard delete) |

## 범위 밖 (Phase 1)

명세서 §40을 따른다: 의미 검색, Local LLM/Gemini/OpenRouter, AI 결과 버전 기록, Cloud Sync, 폴더, Custom Prompt, 다중 테마, Job Resume, Job Queue 제어, Plugin.
