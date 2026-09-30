import type { RawBlinkApi } from '../../shared/ipc/blink-api';
import type { LinkedNote, NoteDetail, ProseMirrorDocDto } from '../../shared/ipc/notes';
import type { BlinkErrorCode, IpcResult } from '../../shared/ipc/result';

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
}

function walk(node: JsonNode, visit: (n: JsonNode) => void): void {
  visit(node);
  node.content?.forEach((child) => walk(child, visit));
}

const textOf = (doc: ProseMirrorDocDto) => {
  const parts: string[] = [];
  walk(doc as JsonNode, (n) => {
    if (n.type === 'text' && n.text) parts.push(n.text);
    if (n.type === 'noteLink' && typeof n.attrs?.label === 'string') parts.push(n.attrs.label);
  });
  return parts.join(' ');
};

const linkTargets = (doc: ProseMirrorDocDto) => {
  const ids = new Set<string>();
  walk(doc as JsonNode, (n) => {
    if (n.type === 'noteLink' && typeof n.attrs?.noteId === 'string') ids.add(n.attrs.noteId);
  });
  return ids;
};

/**
 * 백엔드 없이 Renderer를 띄우기 위한 in-memory 구현. 실제 Preload와 같은 Envelope를 반환한다.
 * 규칙은 화면이 기대는 것만 흉내 낸다(표시 제목, 최신순, NOT_FOUND, 링크 파생). 검색·스니펫은 단순화했다.
 */
export function createMockBlink(): RawBlinkApi {
  const notes = new Map<string, NoteDetail>();
  let tick = Date.UTC(2026, 8, 30);
  const now = () => new Date((tick += 1000)).toISOString();

  const ok = <T>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data });
  const fail = <T>(code: BlinkErrorCode, message: string): Promise<IpcResult<T>> =>
    Promise.resolve({ ok: false, error: { code, message } });
  const emptyDoc = (): ProseMirrorDocDto => ({ type: 'doc', content: [{ type: 'paragraph' }] });
  const displayTitle = (n: NoteDetail) => n.title || '제목 없음';
  const linked = (n: NoteDetail): LinkedNote => ({ noteId: n.id, title: displayTitle(n) });
  const byRecent = (a: NoteDetail, b: NoteDetail) => b.updatedAt.localeCompare(a.updatedAt);

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
            .sort(byRecent)
            .map((n) => ({ id: n.id, title: displayTitle(n), preview: textOf(n.content).slice(0, 120), updatedAt: n.updatedAt })),
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
      search: ({ query, excludeNoteId, limit = 20 }) => {
        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (keywords.length === 0) return ok({ items: [] });
        const items = [...notes.values()]
          .filter((n) => n.id !== excludeNoteId)
          .filter((n) => keywords.every((k) => `${n.title} ${textOf(n.content)}`.toLowerCase().includes(k)))
          .sort((a, b) => Number(b.title.toLowerCase().includes(keywords[0]!)) - Number(a.title.toLowerCase().includes(keywords[0]!)) || byRecent(a, b))
          .slice(0, limit)
          .map((n) => ({ id: n.id, title: displayTitle(n), snippet: textOf(n.content).slice(0, 120), updatedAt: n.updatedAt }));
        return ok({ items });
      },
      listLinks: ({ noteId }) => {
        const source = notes.get(noteId);
        if (!source) return fail('NOTE_NOT_FOUND', `Note ${noteId} not found`);
        const outgoing = [...linkTargets(source.content)]
          .filter((id) => id !== noteId)
          .flatMap((id) => (notes.has(id) ? [linked(notes.get(id)!)] : []));
        const incoming = [...notes.values()]
          .filter((n) => n.id !== noteId && linkTargets(n.content).has(noteId))
          .sort(byRecent)
          .map(linked);
        return ok({ outgoing, incoming });
      },
    },
  };
}
