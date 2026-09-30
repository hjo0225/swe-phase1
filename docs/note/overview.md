# Note Domain — Overview

## 목적

사용자가 작성하는 노트와, 노트 사이의 참조 관계를 관리한다. 명세서의 **Basic(Note CRUD)** 과 **Major 2(기존 노트 검색·연결·내용 가져오기)** 를 담당한다.

## 소유

- 노트 생명주기: 생성, 조회, 저장(자동 저장), 삭제
- 제목·본문 규칙 (길이, 크기, 본문 형식)
- 본문 파생 데이터: `plainText`(검색·미리보기), 참조하는 노트 ID 집합(Note Link)
- 키워드 검색과 매칭 스니펫
- 링크/백링크 조회

## 소유하지 않음

- 편집기 동작(선택, Bubble Menu, 커서 위치 삽입) → Renderer
- AI 변환과 Pending Mark의 의미 → assist
- 인포그래픽 구조 → visualization (note는 infographic 노드를 불투명한 본문 일부로 저장만 한다)

## 핵심 설계 결정

1. **본문은 ProseMirror JSON**, Main이 저장 시 `plainText`와 링크 집합을 파생한다 (D-01).
2. **Note Link는 본문에서 파생된다** (D-02). "노트 연결"은 Renderer가 본문에 `noteLink` 노드를 넣고 저장하는 것이다. 별도 생성/삭제 API가 없다.
3. **"내용 가져오기"는 새 백엔드 기능이 아니다.** `note:get`으로 원본 본문을 읽고, Renderer가 커서 위치에 삽입한 뒤, 평소처럼 자동 저장한다.
4. 본문 스키마(노드 종류)는 Renderer 편집기 스키마가 결정한다. note 도메인이 이해하는 노드는 `text`와 `noteLink` 두 가지뿐이며, 나머지는 불투명하게 보존한다. 따라서 note 도메인은 Tiptap에 의존하지 않는다.

## 용어

| 용어 | 정의 |
| --- | --- |
| Note | 제목과 본문을 가진 문서 |
| NoteContent | 본문 JSON + 파생 데이터를 묶은 값 객체 |
| Outgoing Link | 이 노트 본문이 참조하는 다른 노트 |
| Backlink (Incoming) | 이 노트를 참조하는 다른 노트 |
| Snippet | 검색어 주변의 본문 발췌 |
