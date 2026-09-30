# Note Domain — Repository Contract

```ts
interface NoteRepository {
  findById(id: NoteId): Note | null;
  exists(id: NoteId): boolean;
  findExistingIds(ids: ReadonlySet<NoteId>): Set<NoteId>;

  /** notes 행 UPSERT + note_links(source = note.id) 전체 교체. 단일 트랜잭션. */
  save(note: Note): void;

  /** 없으면 no-op. 링크·AI Job은 FK cascade. */
  delete(id: NoteId): void;

  listSummaries(): NoteSummaryRow[];            // updatedAt DESC, 본문 JSON 제외
  search(query: SearchQuery, opts: { excludeNoteId?: NoteId; limit: number }): NoteSearchRow[];

  findOutgoingLinks(sourceId: NoteId): LinkedNoteRow[];
  findIncomingLinks(targetId: NoteId): LinkedNoteRow[];
}

type NoteSummaryRow = { id: NoteId; title: string; plainTextHead: string; updatedAt: Date };
type NoteSearchRow  = { id: NoteId; title: string; plainText: string; updatedAt: Date };
type LinkedNoteRow  = { noteId: NoteId; title: string };   // title은 원본(빈 문자열 가능)
```

## 설계 메모

- **동기 인터페이스.** `better-sqlite3`가 동기식이고 Main 단일 스레드에서만 쓰므로 `Promise`로 감싸지 않는다. 드라이버를 비동기식으로 바꾸면 이 계약도 바꾼다.
- `listSummaries()`는 도메인 객체 대신 행 타입을 반환한다. 목록에는 본문 JSON이 필요 없고, 전체 노트를 복원하면 비용이 크다. 미리보기 규칙(BR-NOTE-05) 적용은 서비스가 한다.
- `search()`는 **읽기 모델**(`NoteSearchRow`)을 반환한다. 링크까지 복원하지 않은 `Note`를 돌려주면 불완전한 애그리거트가 된다. 스니펫은 서비스가 도메인 순수 함수 `snippetOf(plainText, keywords)`(BR-NOTE-07)로 만든다 — 규칙은 여전히 도메인에 있다.
- 범용 `findAll/update` 는 두지 않는다.
