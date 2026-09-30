import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 쿼리용 스키마. 테이블 생성·제약(FK, CHECK, 인덱스)의 원본은 migrations.ts다.
// blink.db의 옛 notes·note_links 테이블(D-14 이전)은 더 쓰지 않는다. ai_jobs 모양은 보관함 색인 DB(vault-index-db.ts)에서 쓴다.

export const aiProviderSettings = sqliteTable('ai_provider_settings', {
  provider: text('provider').primaryKey(),
  model: text('model').notNull(),
  baseUrl: text('base_url'),
  encryptedApiKey: blob('encrypted_api_key', { mode: 'buffer' }),
  isActive: integer('is_active').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  inputText: text('input_text').notNull(),
  resultKind: text('result_kind'),
  resultText: text('result_text'),
  resultData: text('result_data'),
  failureCode: text('failure_code'),
  failureMessage: text('failure_message'),
  provider: text('provider'),
  model: text('model'),
  attempt: integer('attempt').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
});
