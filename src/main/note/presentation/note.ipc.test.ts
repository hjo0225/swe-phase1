import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoteService } from '../application/note-service';
import { DrizzleNoteRepository } from '../infrastructure/drizzle-note-repository';
import { createTestDatabase } from '../testing';
import { noteIpcHandlers } from './note.ipc';

describe('noteIpcHandlers', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let handlers: ReturnType<typeof noteIpcHandlers>;

  beforeEach(() => {
    database = createTestDatabase();
    handlers = noteIpcHandlers(
      new NoteService(new DrizzleNoteRepository(database.db), { now: () => new Date(0) }, () => crypto.randomUUID()),
    );
  });
  afterEach(() => database.close());

  const call = (channel: string, request: unknown) => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler(request);
  };

  it('exposes every note channel', () => {
    expect(Object.keys(handlers).sort()).toEqual(['note:create', 'note:delete', 'note:get', 'note:list', 'note:update']);
  });

  it('creates and fetches a note through envelopes', async () => {
    const created = await call('note:create', { title: '회의' });
    expect(created.ok).toBe(true);
    const id = created.ok ? (created.data as { id: string }).id : '';
    await expect(call('note:get', { id })).resolves.toMatchObject({ ok: true, data: { id, title: '회의' } });
  });

  it('rejects malformed ids before touching the service', async () => {
    await expect(call('note:get', { id: 'nope' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('requires title or content on update', async () => {
    const created = await call('note:create', {});
    const id = created.ok ? (created.data as { id: string }).id : '';
    await expect(call('note:update', { id })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('maps domain errors to their codes', async () => {
    await expect(call('note:get', { id: crypto.randomUUID() })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOTE_NOT_FOUND' },
    });
    await expect(call('note:create', { content: { type: 'paragraph' } })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOTE_CONTENT_INVALID' },
    });
  });
});
