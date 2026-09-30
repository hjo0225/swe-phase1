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
  {
    id: '0002_ai',
    sql: `
      CREATE TABLE ai_provider_settings (
        provider TEXT PRIMARY KEY CHECK (provider IN ('openai', 'kimi')),
        model TEXT NOT NULL,
        base_url TEXT,
        encrypted_api_key BLOB,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (is_active = 0 OR encrypted_api_key IS NOT NULL)
      );
      CREATE UNIQUE INDEX uq_ai_provider_active ON ai_provider_settings (is_active) WHERE is_active = 1;

      CREATE TABLE ai_jobs (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('EXPAND', 'ORGANIZE', 'VISUALIZE')),
        status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
        input_text TEXT NOT NULL,
        result_kind TEXT,
        result_text TEXT,
        result_data TEXT,
        failure_code TEXT,
        failure_message TEXT,
        provider TEXT,
        model TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX idx_ai_jobs_note ON ai_jobs (note_id, created_at DESC);
      CREATE INDEX idx_ai_jobs_status ON ai_jobs (status);
    `,
  },
];
