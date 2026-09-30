import { missingCapabilities, type Capabilities } from '../../shared/assist/capabilities';
import type { ProviderId, ProviderSettingsView } from '../../shared/ipc/ai-provider';
import type { AIJobView, JobResultDto } from '../../shared/ipc/assist';
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
export interface MockBlinkOptions {
  /** AI Job의 각 상태 전이 사이 지연(ms). */
  aiDelayMs?: number;
}

/** 입력에 `#fail:CODE`가 있으면 첫 시도는 그 코드로 실패하고 재시도는 성공한다 (UI 개발·테스트용). */
const FAIL_MARKER = /#fail:([A-Z_]+)/;

function mockResult(job: AIJobView): JobResultDto {
  switch (job.type) {
    case 'ORGANIZE':
      return { kind: 'MARKDOWN', markdown: `## 정리된 메모

- ${job.inputText.trim()}` };
    case 'EXPAND':
      return {
        kind: 'RESEARCHED_MARKDOWN',
        markdown: `${job.inputText.trim()} (구체화됨)

**출처**
- [예시 출처](https://example.com/)`,
        sources: [{ title: '예시 출처', url: 'https://example.com/' }],
      };
    case 'VISUALIZE':
      return {
        kind: 'INFOGRAPHIC',
        spec: {
          version: 1,
          type: 'process',
          title: '처리 과정',
          nodes: [
            { id: '1', title: '입력', description: job.inputText.slice(0, 40) },
            { id: '2', title: '분석', description: '' },
            { id: '3', title: '결과', description: '' },
          ],
          edges: [
            ['1', '2'],
            ['2', '3'],
          ],
        },
      };
  }
}

export function createMockBlink(options: MockBlinkOptions = {}): RawBlinkApi {
  const aiDelayMs = options.aiDelayMs ?? 400;
  const jobs = new Map<string, AIJobView>();
  const jobListeners = new Set<(job: AIJobView) => void>();
  const emitJob = (job: AIJobView) => {
    jobs.set(job.id, job);
    for (const listener of jobListeners) listener(structuredClone(job));
  };
  const runJob = (id: string) => {
    setTimeout(() => {
      const queued = jobs.get(id);
      if (!queued || queued.status !== 'QUEUED') return;
      emitJob({ ...queued, status: 'RUNNING', startedAt: now() });
      setTimeout(() => {
        const running = jobs.get(id);
        if (!running || running.status !== 'RUNNING') return;
        const failCode = running.attempt === 1 ? running.inputText.match(FAIL_MARKER)?.[1] : undefined;
        emitJob(
          failCode
            ? { ...running, status: 'FAILED', failure: { code: failCode as never, retryable: true }, completedAt: now() }
            : { ...running, status: 'COMPLETED', result: mockResult(running), completedAt: now() },
        );
      }, aiDelayMs);
    }, aiDelayMs);
  };

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

  const all: Capabilities = { generate: true, structuredOutput: true, webSearch: true };
  const noSearch: Capabilities = { generate: true, structuredOutput: true, webSearch: false };
  const catalog: Record<ProviderId, { id: string; label: string; capabilities: Capabilities }[]> = {
    openai: [
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (권장)', capabilities: all },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (구체화 미지원)', capabilities: noSearch },
    ],
    kimi: [],
  };
  const providerState: Record<ProviderId, { model: string | null; baseUrl: string | null; hasApiKey: boolean }> = {
    openai: { model: null, baseUrl: null, hasApiKey: false },
    kimi: { model: null, baseUrl: null, hasApiKey: false },
  };
  let activeProvider: ProviderId | null = null;
  const settingsView = (): ProviderSettingsView => {
    const active = activeProvider ? providerState[activeProvider] : null;
    const activeModel = activeProvider && active?.model ? catalog[activeProvider].find((m) => m.id === active.model) : undefined;
    return {
      secureStorageAvailable: true,
      active: activeProvider && activeModel ? { provider: activeProvider, model: activeModel.id, capabilities: activeModel.capabilities } : null,
      providers: (['openai', 'kimi'] as const).map((provider) => ({
        provider,
        label: provider === 'openai' ? 'OpenAI' : 'Kimi',
        isActive: activeProvider === provider,
        ...providerState[provider],
        models: catalog[provider],
      })),
    };
  };

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
    visualization: {
      savePng: ({ suggestedFileName }) => ok({ saved: true as const, filePath: `mock/${suggestedFileName ?? 'infographic'}.png` }),
    },
    settings: {
      getProvider: () => ok(settingsView()),
      updateProvider: ({ provider, model, apiKey, baseUrl }) => {
        if (!catalog[provider].some((m) => m.id === model)) return fail('PROVIDER_MODEL_NOT_SUPPORTED', model);
        const state = providerState[provider];
        if (!apiKey && !state.hasApiKey) return fail('PROVIDER_API_KEY_REQUIRED', 'API key required');
        providerState[provider] = { model, baseUrl: baseUrl === undefined ? state.baseUrl : baseUrl, hasApiKey: true };
        activeProvider = provider;
        return ok(settingsView());
      },
      testProvider: ({ provider, apiKey }) => {
        if (!apiKey && !providerState[provider].hasApiKey) return fail('PROVIDER_API_KEY_REQUIRED', 'API key required');
        return ok(apiKey === 'bad-key' ? { ok: false as const, failure: { code: 'AUTH_FAILED' as const } } : { ok: true as const });
      },
    },
    ai: {
      createJob: ({ jobId, noteId, type, inputText }) => {
        const existing = jobs.get(jobId);
        if (existing) return ok(structuredClone(existing));
        if (!notes.has(noteId)) return fail('NOTE_NOT_FOUND', noteId);
        const active = settingsView().active;
        if (!active) return fail('AI_PROVIDER_NOT_CONFIGURED', 'No active provider');
        if (missingCapabilities(type, active.capabilities).length > 0) return fail('AI_CAPABILITY_UNSUPPORTED', type);
        if (!inputText.trim()) return fail('AI_INPUT_EMPTY', 'empty');
        const job: AIJobView = { id: jobId, noteId, type, status: 'QUEUED', inputText, attempt: 1, createdAt: now() };
        jobs.set(jobId, job);
        runJob(jobId);
        return ok(structuredClone(job));
      },
      getJob: ({ jobId }) => {
        const job = jobs.get(jobId);
        return job ? ok(structuredClone(job)) : fail('AI_JOB_NOT_FOUND', jobId);
      },
      listJobs: ({ noteId }) => ok({ items: [...jobs.values()].filter((j) => j.noteId === noteId).map((j) => structuredClone(j)) }),
      retryJob: ({ jobId }) => {
        const job = jobs.get(jobId);
        if (!job) return fail('AI_JOB_NOT_FOUND', jobId);
        if (job.status !== 'FAILED') return fail('AI_JOB_NOT_RETRYABLE', job.status);
        const retried: AIJobView = {
          id: job.id,
          noteId: job.noteId,
          type: job.type,
          status: 'QUEUED',
          inputText: job.inputText,
          attempt: job.attempt + 1,
          createdAt: job.createdAt,
        };
        emitJob(retried);
        runJob(jobId);
        return ok(structuredClone(retried));
      },
      onJobUpdated: (listener) => {
        jobListeners.add(listener);
        return () => jobListeners.delete(listener);
      },
    },
  };
}
