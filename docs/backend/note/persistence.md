# Note Domain — Persistence

SQLite (`better-sqlite3`) + Drizzle ORM. 연결 시 `PRAGMA foreign_keys = ON` 필수 (SQLite 기본값은 OFF라 cascade가 동작하지 않는다).

## 테이블

### `notes`

| 컬럼 | 타입 | 제약 | 비고 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID |
| `title` | TEXT | NOT NULL DEFAULT `''` | 원본 제목 |
| `content_json` | TEXT | NOT NULL | ProseMirror JSON 직렬화 |
| `plain_text` | TEXT | NOT NULL | 파생값. 검색·미리보기 전용, 직접 수정 금지 |
| `created_at` | INTEGER | NOT NULL | epoch ms |
| `updated_at` | INTEGER | NOT NULL | epoch ms |

인덱스: `idx_notes_updated_at (updated_at DESC)`

### `note_links`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `source_note_id` | TEXT | NOT NULL, FK → `notes.id` ON DELETE CASCADE |
| `target_note_id` | TEXT | NOT NULL, FK → `notes.id` ON DELETE CASCADE |
| `created_at` | INTEGER | NOT NULL |

- PK `(source_note_id, target_note_id)`, `CHECK (source_note_id <> target_note_id)`
- 인덱스: `idx_note_links_target (target_note_id)` — 백링크 조회
- 명세서 §22.1의 `id` 컬럼은 두지 않는다. 링크는 (출발, 도착) 쌍 자체가 식별자다.

## 매핑

| Domain | Persistence |
| --- | --- |
| `Note.content.doc` | `content_json` (`JSON.stringify`) |
| `Note.content.plainText` | `plain_text` |
| `Note.linkedNoteIds` | `note_links` 행 집합 (source = note.id) |

복원 시 `NoteContent.from(JSON.parse(content_json))`로 파생값을 다시 계산하지 않고, 저장된 `plain_text`를 신뢰하는 `NoteContent.restore(doc, plainText, referencedIds)`를 사용한다. 파생 규칙이 바뀌면 마이그레이션에서 전체 재계산한다.

## save(note) 동작

```sql
BEGIN;
INSERT INTO notes (...) VALUES (...)
  ON CONFLICT(id) DO UPDATE SET title=?, content_json=?, plain_text=?, updated_at=?;
DELETE FROM note_links WHERE source_note_id = ? AND target_note_id NOT IN (...linkedIds);
INSERT OR IGNORE INTO note_links (source_note_id, target_note_id, created_at) VALUES ...;
COMMIT;
```

`INSERT OR IGNORE`로 기존 링크의 `created_at`을 보존한다.

## search() 쿼리

```sql
SELECT * FROM notes
WHERE (:excludeNoteId IS NULL OR id <> :excludeNoteId)   -- NULL과 <> 비교는 전부 거짓이 되므로 주의
  AND (title LIKE :k1 ESCAPE '\' OR plain_text LIKE :k1 ESCAPE '\')
  AND (title LIKE :k2 ESCAPE '\' OR plain_text LIKE :k2 ESCAPE '\')   -- 키워드마다 반복
ORDER BY
  (title LIKE :k1 ESCAPE '\') DESC,   -- 첫 키워드의 제목 매칭 우선
  updated_at DESC
LIMIT :limit;
```

- `:kN = '%' || escape(keyword) || '%'`, `escape`는 `\`, `%`, `_` 앞에 `\`를 붙인다.
- SQLite `LIKE`는 ASCII만 대소문자를 무시한다. 한글에는 대소문자가 없으므로 문제없다.
- 수천 건 규모에서는 전체 스캔으로 충분하다. 느려지면 FTS5(`trigram` tokenizer)로 교체하고 이 문서를 갱신한다(Repository 계약은 불변).
