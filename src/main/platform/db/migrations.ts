import type { Migration } from './migrate';

// SQL을 TS 모듈에 두면 테스트·dev·패키징 어디서든 파일 경로 없이 번들된다.
// 한 번 배포된 마이그레이션은 수정하지 않고 새 항목을 추가한다.
export const migrations: readonly Migration[] = [
  {
    id: '0001_notes',
    sql: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content_json TEXT NOT NULL,
        plain_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notes_updated_at ON notes (updated_at DESC);

      CREATE TABLE note_links (
        source_note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        target_note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source_note_id, target_note_id),
        CHECK (source_note_id <> target_note_id)
      );
      CREATE INDEX idx_note_links_target ON note_links (target_note_id);
    `,
  },
];
