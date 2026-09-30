# Note Domain — Persistence

## 파일 (원본)

| 대상 | 위치 |
| --- | --- |
| 노트 | `<보관함>/<폴더…>/<이름>.md` (UTF-8, 줄바꿈 `\n`) |
| 폴더 | `<보관함>/<폴더…>/` |
| 임시 파일 | 쓰는 동안만 `<같은 폴더>/.<이름>.md.blink-tmp` → 바로 교체 |

Blink 전용 요소의 Markdown 표기 (D-18):

```markdown
관련 내용은 [[Electron Architecture]] 참고, 별칭은 [[회의록|지난 회의]]
<span data-ai-pending="3f2c…">AI가 처리 중인 문장</span>

```blink-infographic
{ "version": 1, "type": "process", "title": "…", "nodes": [...], "edges": [...] }
```
```

## 색인 DB (`userData/vaults/<sha1(보관함 경로)>.db`, D-17)

보관함마다 하나. 파일에서 다시 만들 수 있다(AI Job 제외). 마이그레이션 목록은 앱 설정 DB와 따로 둔다(`vaultMigrations`).

### `notes`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `id` | TEXT | PK (UUID) |
| `path` | TEXT | NOT NULL, UNIQUE (`COLLATE NOCASE` — Windows·macOS 파일 시스템은 대소문자를 구분하지 않는다) |
| `plain_text` | TEXT | NOT NULL |
| `size` | INTEGER | NOT NULL |
| `mtime_ms` | INTEGER | NOT NULL |
| `created_at` / `updated_at` | INTEGER | NOT NULL |

### `note_links`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `source_id` | TEXT | FK → notes ON DELETE CASCADE |
| `target_key` | TEXT | 소문자로 정규화한 대상(`#`·`^` 앞부분) |
| `target_text` | TEXT | 원문 대상 |

PK `(source_id, target_key)`, 인덱스 `(target_key)`.

### `ai_jobs`

기존과 같다(`note_id` FK → notes ON DELETE CASCADE). docs/backend/assist/persistence.md.

## 앱 설정

| 파일 | 내용 |
| --- | --- |
| `userData/blink.db` | `ai_provider_settings` (보관함과 무관). 이전 버전의 `notes`·`note_links`·`ai_jobs` 테이블은 더 이상 쓰지 않는다 |
| `userData/app-config.json` | 마지막 보관함, 최근 보관함 10개 |

## 색인 맞추기

1. 파일 목록과 색인 목록을 경로로 맞춘다.
2. 크기·수정 시각이 같으면 건너뛴다. 다르면 다시 읽어 `plain_text`·링크를 갱신한다(ID 유지).
3. 색인에만 있는 경로는 지운다. 파일에만 있는 경로는 새 ID로 넣는다.
4. **자기가 쓴 변경**: 저장·이름 변경 직후 색인을 먼저 갱신하므로, 곧 오는 감시 이벤트는 크기·수정 시각이 같아 무시된다.
