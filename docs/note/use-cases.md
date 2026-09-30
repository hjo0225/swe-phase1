# Note Domain — Use Cases

Actor는 모두 **사용자**(Renderer를 통해). Renderer만의 동작은 "Renderer" 단계로 표시한다.

---

## UC-NOTE-001 노트 생성

- **Trigger:** `+ New Note` 클릭
- **Main Flow:**
  1. 제목(선택)과 본문(선택)으로 노트를 만든다. 없으면 빈 제목과 빈 문서.
  2. 저장 후 생성된 노트를 반환한다.
- **Business Rules:** BR-NOTE-01, 02
- **Postconditions:** 노트 목록 최상단(가장 최근 수정)에 나타난다.

## UC-NOTE-002 노트 목록 조회

- **Trigger:** 앱 실행, 노트 생성/삭제 후
- **Main Flow:** 모든 노트의 요약(ID, 표시 제목, 미리보기, 수정 시각)을 `updatedAt` 내림차순으로 반환한다.
- **Business Rules:** BR-NOTE-05 (미리보기)

## UC-NOTE-003 노트 상세 조회

- **Trigger:** 목록에서 노트 선택, 링크 클릭, 검색 결과 상세 보기, 내용 가져오기
- **Main Flow:** 제목·본문 JSON·시각을 반환한다.
- **Failure:** 없는 노트 → `NOTE_NOT_FOUND` (삭제된 노트를 가리키는 깨진 링크 클릭 포함)

## UC-NOTE-004 노트 저장 (자동 저장)

- **Trigger:** Renderer 편집 후 500~1000ms Debounce, 제목 변경, AI 결과 Commit 후, 링크 삽입 후, 내용 가져오기 후
- **Preconditions:** 노트가 존재한다.
- **Main Flow:**
  1. 노트를 불러온다.
  2. 변경된 제목/본문을 적용한다 (`note.rename()`, `note.replaceContent()`).
  3. 본문에서 `plainText`와 참조 노트 ID 집합을 파생한다.
  4. 참조 대상 중 **존재하는 노트만**, 자기 자신은 제외하고 링크 집합으로 확정한다.
  5. 노트 행과 링크 집합을 하나의 트랜잭션으로 저장한다.
- **Alternative Flow:** 제목·본문이 모두 이전과 같으면 저장하지 않고 `updatedAt`도 바꾸지 않는다.
- **Failure:** `NOTE_NOT_FOUND`, `NOTE_TITLE_TOO_LONG`, `NOTE_CONTENT_INVALID`, `NOTE_CONTENT_TOO_LARGE`
- **Business Rules:** BR-NOTE-01~04
- **Postconditions:** 링크/백링크 조회가 저장된 본문과 일치한다.

## UC-NOTE-005 노트 삭제

- **Trigger:** 삭제 → Confirm Dialog 승인 (Dialog는 Renderer)
- **Main Flow:** 노트를 삭제한다. 이 노트가 출발점·도착점인 링크 행과 이 노트의 AI Job이 함께 삭제된다(FK cascade).
- **Alternative Flow:** 이미 없는 노트 → 성공으로 처리 (멱등)
- **Postconditions:** 다른 노트 본문 속 이 노트로의 `noteLink` 노드는 남지만 **깨진 링크**로 표시된다(Renderer). 해당 노트가 다음에 저장될 때 링크 집합에서도 제외된다.

## UC-NOTE-006 노트 검색

- **Trigger:** 단축키 또는 Search 버튼 → 키워드 입력 (Renderer는 입력 Debounce 200ms)
- **Main Flow:**
  1. 검색어를 공백으로 나눠 키워드 목록을 만든다.
  2. 제목 또는 본문(`plainText`)에 **모든 키워드**가 포함된 노트를 찾는다.
  3. 정렬: 제목 매칭 우선 → `updatedAt` 내림차순.
  4. 각 결과에 표시 제목, 매칭 스니펫, 수정 시각을 담아 최대 `limit`건 반환한다.
- **Alternative Flow:** `excludeNoteId`가 주어지면 해당 노트(현재 노트)를 결과에서 뺀다. 검색어가 공백뿐이면 빈 결과.
- **Business Rules:** BR-NOTE-06, 07

## UC-NOTE-007 노트 연결

- **Trigger:** 검색 결과에서 `[연결]`
- **Main Flow:**
  1. (Renderer) 현재 커서 위치에 `noteLink` 노드(`noteId`, 표시용 `label`)를 삽입한다.
  2. (Renderer) 자동 저장 → **UC-NOTE-004**가 링크를 파생해 저장한다.
- **Postconditions:** 현재 노트의 Outgoing, 대상 노트의 Backlink에 나타난다.
- **Note:** 백엔드 전용 채널이 없다 (D-02).

## UC-NOTE-008 링크 목록 조회

- **Trigger:** 노트 열기(링크 제목 표시·깨진 링크 판별), 백링크 패널
- **Main Flow:** 노트의 Outgoing 링크와 Incoming 링크를 각 대상의 **현재 제목**과 함께 반환한다.
- **Note:** 링크 노드의 `label`은 삽입 시점 스냅샷이다. 대상 제목이 바뀌면 Renderer는 이 조회 결과의 현재 제목으로 표시한다.

## UC-NOTE-009 내용 가져오기

- **Trigger:** 검색 결과에서 `[내용 가져오기]` (전체 또는 원본 상세에서 선택한 일부)
- **Main Flow:**
  1. **UC-NOTE-003**으로 원본 노트 본문을 읽는다.
  2. (Renderer) 전체 문서 또는 선택한 Slice를 현재 커서 위치에 삽입한다. 이때 `aiPending` Mark를 제거한다 (BR-ASSIST-06).
  3. (Renderer) 자동 저장 → **UC-NOTE-004**.
- **Note:** 가져온 본문 속 `noteLink`는 그대로 유지되며 저장 시 현재 노트의 링크로 파생된다. 인포그래픽 노드는 Spec을 품고 있으므로 그대로 복사된다(D-05).

---

## Business Rules

| ID | 규칙 |
| --- | --- |
| BR-NOTE-01 | 제목은 앞뒤 공백을 제거해 저장하며 최대 200자. 빈 제목을 허용하고 표시할 때 `제목 없음`을 쓴다. |
| BR-NOTE-02 | 본문은 `type: 'doc'`인 ProseMirror JSON이며, 직렬화 크기는 최대 2 MB. |
| BR-NOTE-03 | 링크 집합은 본문의 `noteLink` 노드에서만 파생된다. 자기 참조와 존재하지 않는 대상은 제외한다. |
| BR-NOTE-04 | 제목·본문이 실제로 바뀐 경우에만 `updatedAt`을 갱신한다. |
| BR-NOTE-05 | 미리보기는 `plainText`의 앞 120자(공백 정규화). |
| BR-NOTE-06 | 검색은 대소문자를 구분하지 않고, 부분 문자열 기준이며, 키워드는 AND로 결합한다. `%`, `_`, `\`는 문자 그대로 취급한다. |
| BR-NOTE-07 | 스니펫은 첫 번째 매칭 위치 앞 30자 ~ 뒤 90자. 본문 매칭이 없으면(제목만 매칭) 미리보기를 사용한다. |
