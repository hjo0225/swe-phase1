import { blob, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 쿼리용 스키마. 테이블 생성·제약(FK, CHECK, 인덱스)의 원본은 migrations.ts다.

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  contentJson: text('content_json').notNull(),
  plainText: text('plain_text').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const noteLinks = sqliteTable(
  'note_links',
  {
    sourceNoteId: text('source_note_id').notNull(),
    targetNoteId: text('target_note_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceNoteId, t.targetNoteId] })],
);

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
