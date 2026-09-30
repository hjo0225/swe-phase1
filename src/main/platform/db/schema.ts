import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
