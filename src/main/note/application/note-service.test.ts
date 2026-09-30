import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleNoteRepository } from '../infrastructure/drizzle-note-repository';
import { createTestDatabase, linkNode, noteDoc, textNode } from '../testing';
import { NoteService } from './note-service';

const MISSING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('NoteService', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let service: NoteService;
  let minute: number;
  let seq: number;

  beforeEach(() => {
    database = createTestDatabase();
    minute = 0;
    seq = 0;
    service = new NoteService(
      new DrizzleNoteRepository(database.db),
      { now: () => new Date(Date.UTC(2026, 8, 30, 0, minute)) },
      () => `0000000${++seq}-0000-4000-8000-000000000000`,
    );
  });
  afterEach(() => database.close());

  it('creates an empty untitled note by default', () => {
    const created = service.create({});
    expect(created).toEqual({
      id: '00000001-0000-4000-8000-000000000000',
      title: '',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
  });

  it('lists summaries with display titles and previews', () => {
    service.create({ title: '회의', content: noteDoc([textNode('api 얘기')]) });
    minute = 1;
    service.create({});
    expect(service.list().items).toEqual([
      { id: '00000002-0000-4000-8000-000000000000', title: '제목 없음', preview: '', updatedAt: '2026-09-30T00:01:00.000Z' },
      { id: '00000001-0000-4000-8000-000000000000', title: '회의', preview: 'api 얘기', updatedAt: '2026-09-30T00:00:00.000Z' },
    ]);
  });

  it('saves changes and keeps updatedAt when nothing changed', () => {
    const { id } = service.create({ title: 'a' });
    minute = 1;
    expect(service.update({ id, title: 'a' })).toEqual({ id, updatedAt: '2026-09-30T00:00:00.000Z', changed: false });
    expect(service.update({ id, title: 'b' })).toEqual({ id, updatedAt: '2026-09-30T00:01:00.000Z', changed: true });
    expect(service.get(id).title).toBe('b');
  });

  it('keeps only links to existing notes', () => {
    const target = service.create({ title: 'target' });
    const source = service.create({});
    service.update({ id: source.id, content: noteDoc([linkNode(target.id), linkNode(MISSING)]) });
    const repo = new DrizzleNoteRepository(database.db);
    expect(repo.findById(source.id)?.linkedNoteIds).toEqual(new Set([target.id]));
  });

  it('fails with NOTE_NOT_FOUND for unknown notes', () => {
    expect(() => service.get(MISSING)).toThrow(expect.objectContaining({ code: 'NOTE_NOT_FOUND' }));
    expect(() => service.update({ id: MISSING, title: 'x' })).toThrow(expect.objectContaining({ code: 'NOTE_NOT_FOUND' }));
  });

  it('searches with snippets and display titles', () => {
    const hit = service.create({ title: '', content: noteDoc([textNode('Electron은 Main과 Renderer로 나뉜다')]) });
    const current = service.create({ title: 'Electron 메모' });
    expect(service.search({ query: 'renderer', excludeNoteId: current.id })).toEqual({
      items: [{ id: hit.id, title: '제목 없음', snippet: 'Electron은 Main과 Renderer로 나뉜다', updatedAt: hit.updatedAt }],
    });
    expect(service.search({ query: '   ' })).toEqual({ items: [] });
  });

  it('lists links with display titles', () => {
    const target = service.create({});
    const source = service.create({ title: '출발', content: noteDoc([linkNode(target.id, '옛 라벨')]) });
    expect(service.listLinks(source.id)).toEqual({ outgoing: [{ noteId: target.id, title: '제목 없음' }], incoming: [] });
    expect(service.listLinks(target.id)).toEqual({ outgoing: [], incoming: [{ noteId: source.id, title: '출발' }] });
    expect(() => service.listLinks(MISSING)).toThrow(expect.objectContaining({ code: 'NOTE_NOT_FOUND' }));
  });

  it('deletes idempotently', () => {
    const { id } = service.create({});
    expect(service.delete(id)).toEqual({ deleted: true });
    expect(service.delete(id)).toEqual({ deleted: true });
    expect(service.exists(id)).toBe(false);
  });
});
