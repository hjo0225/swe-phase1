# Note Domain — Domain Model

## Aggregate: Note

| 항목 | 내용 |
| --- | --- |
| Responsibility | 노트 하나의 제목·본문과 그로부터 파생되는 링크 집합의 일관성 |
| State | `id`, `title: NoteTitle`, `content: NoteContent`, `linkedNoteIds: Set<NoteId>`, `createdAt`, `updatedAt` |
| Behavior | `Note.create(id, title, content, now)`, `rename(title, now)`, `replaceContent(content, now)`, `resolveLinks(existingIds)`, `preview()`, `snippetFor(keywords)` |
| Invariants | 링크 집합은 항상 현재 본문의 참조에서 파생된 것이며 자기 자신을 포함하지 않는다. `updatedAt >= createdAt`. |
| Lifecycle | 생성 → (저장 반복) → 삭제. 상태 머신 없음. |

`linkedNoteIds`는 두 단계로 확정된다.

1. `replaceContent()`가 본문에서 **참조 후보**(`content.referencedNoteIds`)를 얻는다.
2. 애플리케이션이 후보 중 존재하는 ID를 조회해 `resolveLinks(existingIds)`로 확정한다. 존재 여부는 Repository만 알기 때문에 이 단계를 분리한다.

링크는 별도 엔티티가 아니다. 생성·삭제 행위가 없고 본문 외의 이유로 변하지 않으므로 Note 애그리거트의 파생 상태로 둔다. DB에는 조회(백링크) 성능을 위해 별도 테이블로 저장한다([persistence.md](persistence.md)).

## Value Object: NoteContent

| 항목 | 내용 |
| --- | --- |
| Responsibility | 본문 JSON의 형식 검증과 파생 데이터 계산 |
| State | `doc` (ProseMirror JSON, 불투명 트리), `plainText: string`, `referencedNoteIds: Set<NoteId>` |
| Creation | `NoteContent.from(json)` — 형식·크기 검증 후 파생값을 **한 번** 계산. `NoteContent.empty()` |
| Invariants | 루트 `type === 'doc'`, 직렬화 크기 ≤ 2 MB (BR-NOTE-02) |

파생 규칙 (트리를 재귀 순회, Tiptap 의존 없음):

| 노드 | plainText | referencedNoteIds |
| --- | --- | --- |
| `text` | `node.text` 추가 | — |
| `noteLink` | `attrs.label` 추가 | `attrs.noteId` 추가 (UUID 형식일 때만) |
| `hardBreak` | `\n` | — |
| 블록 노드(`paragraph`, `heading`, `listItem`, `blockquote`, `codeBlock` 등) | 자식 결과 뒤에 `\n` | — |
| 그 밖의 노드(`infographic` 등) | 무시 | — |

## Value Object: NoteTitle

- 앞뒤 공백 제거, 최대 200자 (BR-NOTE-01).
- `displayTitle()` → 빈 값이면 `제목 없음`.

## Value Object: SearchQuery

- `SearchQuery.parse(raw)` → 공백 기준 분리, 빈 토큰 제거, 최대 5개 키워드, 각 키워드 최대 100자.
- `isEmpty()` → 키워드가 없으면 검색하지 않는다.
- LIKE 이스케이프는 persistence 책임이다(도메인은 문자 그대로의 키워드만 가진다).

## 도메인 함수: snippet

`snippetFor(keywords)`는 `plainText`에서 첫 매칭 위치(대소문자 무시)를 찾아 앞 30자 ~ 뒤 90자를 잘라 반환한다. 잘린 쪽에 `…`를 붙인다. 매칭이 없으면 `preview()` (BR-NOTE-07).

검색은 SQL이 후보를 거르고, **스니펫은 도메인 함수가 만든다.** SQL로 스니펫을 만들면 규칙이 persistence에 숨는다.

## 관계

```text
Note A ──linkedNoteIds──▶ Note B      (A 본문에 B를 가리키는 noteLink 노드가 있다)
Note B ◀──backlink────── Note A      (조회 시 역방향으로 계산)
```

## Object Diagram — 링크 파생과 삭제

링크가 본문에서 파생된다는 규칙이 삭제와 만나는 경우를 확인하기 위한 예시다.

```text
저장 전
  Note A.content: "관련 내용은 [[Electron Architecture → B]] 와 [[Old → C]] 참고"
  Note B: 존재
  Note C: 삭제됨

UC-NOTE-004 저장
  content.referencedNoteIds = {B, C}
  repository.existingIds({B, C}) = {B}
  A.resolveLinks({B}) → A.linkedNoteIds = {B}

결과
  note_links: (A → B)
  A 본문의 [[Old → C]] 노드는 그대로 남음 → Renderer가 깨진 링크로 표시
```
