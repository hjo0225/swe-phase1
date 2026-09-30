import type { RawBlinkApi } from '../../shared/ipc/blink-api';
import type { NoteDetail, ProseMirrorDocDto } from '../../shared/ipc/notes';
import type { BlinkErrorCode, IpcResult } from '../../shared/ipc/result';

/**
 * 백엔드 없이 Renderer를 띄우기 위한 in-memory 구현. 실제 Preload와 같은 Envelope를 반환한다.
 * 규칙은 백엔드와 같은 것만 흉내 낸다(표시 제목, 최신순, NOT_FOUND). 파생 텍스트는 단순화한다.
 */
export function createMockBlink(): RawBlinkApi {
  const notes = new Map<string, NoteDetail>();
  let tick = Date.UTC(2026, 8, 30);
  const now = () => new Date((tick += 1000)).toISOString();

  const ok = <T>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data });
  const fail = <T>(code: BlinkErrorCode, message: string): Promise<IpcResult<T>> =>
    Promise.resolve({ ok: false, error: { code, message } });
  const emptyDoc = (): ProseMirrorDocDto => ({ type: 'doc', content: [{ type: 'paragraph' }] });
  const textOf = (doc: ProseMirrorDocDto) => JSON.stringify(doc).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join(' ') ?? '';

  return {
    app: {
      getInfo: () => ok({ version: 'mock' }),
      onWillClose: () => () => undefined,
      readyToClose: () => ok(undefined),
    },
    notes: {
      create: (input) => {
        const at = now();
        const note: NoteDetail = {
          id: crypto.randomUUID(),
          title: (input.title ?? '').trim(),
          content: input.content ?? emptyDoc(),
          createdAt: at,
          updatedAt: at,
        };
        notes.set(note.id, note);
        return ok(structuredClone(note));
      },
      list: () =>
        ok({
          items: [...notes.values()]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((n) => ({ id: n.id, title: n.title || '제목 없음', preview: textOf(n.content).slice(0, 120), updatedAt: n.updatedAt })),
        }),
      get: ({ id }) => {
        const note = notes.get(id);
        return note ? ok(structuredClone(note)) : fail('NOTE_NOT_FOUND', `Note ${id} not found`);
      },
      update: ({ id, title, content }) => {
        const note = notes.get(id);
        if (!note) return fail('NOTE_NOT_FOUND', `Note ${id} not found`);
        const next = { ...note, title: title?.trim() ?? note.title, content: content ?? note.content };
        const changed = next.title !== note.title || JSON.stringify(next.content) !== JSON.stringify(note.content);
        if (changed) notes.set(id, { ...next, updatedAt: now() });
        return ok({ id, updatedAt: notes.get(id)!.updatedAt, changed });
      },
      delete: ({ id }) => {
        notes.delete(id);
        return ok({ deleted: true as const });
      },
    },
  };
}
