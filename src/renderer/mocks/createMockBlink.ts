import { missingCapabilities, type Capabilities } from '../../shared/assist/capabilities';
import type { ProviderId, ProviderSettingsView } from '../../shared/ipc/ai-provider';
import type { AIJobView, JobResultDto } from '../../shared/ipc/assist';
import type { RawBlinkApi } from '../../shared/ipc/blink-api';
import type { LinkedNote, NoteSummary, VaultChangedEvent, VaultInfo } from '../../shared/ipc/notes';
import type { OrganizePlan } from '../../shared/ipc/organize';
import type { BlinkErrorCode, IpcResult } from '../../shared/ipc/result';
import { extractLinkTargets, linkTargetFor, resolveLinkTarget, rewriteLinkTargets } from '../../shared/notes/wiki-link';

/**
 * 백엔드 없이 Renderer를 띄우기 위한 in-memory 구현. 실제 Preload와 같은 Envelope를 반환한다.
 * 규칙은 화면이 기대는 것만 흉내 낸다(제목 = 파일 이름, 링크 해석·고치기, NOT_FOUND). 검색·스니펫은 단순화했다.
 */
export interface MockBlinkOptions {
  /** AI Job의 각 상태 전이 사이 지연(ms). */
  aiDelayMs?: number;
  /** false면 보관함 없이 시작한다 (선택 화면). 기본은 빈 보관함이 열려 있다. */
  vaultOpen?: boolean;
  /** 테스트가 "밖에서 바뀜"을 흉내 낼 수 있게 Mock이 채운다. */
  controls?: Partial<MockControls>;
  /** organize:preview가 돌려줄 계획. 없으면 «나눌 만한 묶음 없음». */
  organizePreview?: (folder: string) => OrganizePlan;
  /** organize:preview를 이 오류 코드로 실패시킨다 (AI 미설정 등) */
  organizePreviewError?: BlinkErrorCode;
  /** 분류 작업(미리보기·자동 배치)이 이 Promise가 끝날 때까지 기다린다 — «AI가 일하는 중» 상태 시험용 */
  organizeGate?: () => Promise<void>;
}

export interface MockControls {
  /** 다른 앱이 파일을 고친 것처럼 본문을 바꾸고 vault:changed를 보낸다. */
  externalEdit(noteId: string, content: string): void;
  /** 경로의 파일 내용 (테스트 확인용). */
  contentOf(path: string): string | undefined;
}

interface MockNote {
  id: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const MOCK_VAULT: VaultInfo = { root: 'C:/Blink/Mock', name: 'Mock' };
const INVALID_NAME = /[\\/:*?"<>|]/;

const plainTextOf = (markdown: string) =>
  markdown
    .replace(/```blink-infographic[\s\S]*?```/g, ' ')
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*?))?\]\]/g, (_m, target: string, label?: string) => label || target)
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 입력에 `#fail:CODE`가 있으면 첫 시도는 그 코드로 실패하고 재시도는 성공한다 (UI 개발·테스트용). */
const FAIL_MARKER = /#fail:([A-Z_]+)/;

function mockResult(job: AIJobView): JobResultDto {
  switch (job.type) {
    case 'ORGANIZE':
      return { kind: 'MARKDOWN', markdown: `## 정리된 메모\n\n- ${job.inputText.trim()}` };
    case 'EXPAND':
      return {
        kind: 'RESEARCHED_MARKDOWN',
        markdown: `${job.inputText.trim()} (구체화됨)\n\n**Sources**\n- [예시 출처](https://example.com/)`,
        sources: [{ title: '예시 출처', url: 'https://example.com/' }],
      };
    case 'VISUALIZE':
      if (job.inputText.includes('architecture')) {
        return {
          kind: 'INFOGRAPHIC',
          spec: {
            version: 1,
            type: 'architecture',
            title: 'Web service',
            groups: [{ id: 'vpc', title: 'VPC A' }],
            nodes: [
              { id: 'u', title: 'Users', icon: 'user' },
              { id: 'w', title: 'Web server', icon: 'server', group: 'vpc' },
            ],
            edges: [['u', 'w', { label: 'HTTPS' }]],
          },
        };
      }
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

  const notes = new Map<string, MockNote>();
  const folders = new Set<string>();
  let vault: VaultInfo | null = options.vaultOpen === false ? null : MOCK_VAULT;
  const recent: VaultInfo[] = vault ? [vault] : [];
  const vaultListeners = new Set<(event: VaultChangedEvent) => void>();
  let tick = Date.UTC(2026, 8, 30);
  const now = () => new Date((tick += 1000)).toISOString();

  const ok = <T>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data });
  const fail = <T>(code: BlinkErrorCode, message: string): Promise<IpcResult<T>> =>
    Promise.resolve({ ok: false, error: { code, message } });
  const notOpen = <T>() => fail<T>('VAULT_NOT_OPEN', 'No vault is open');
  const titleOf = (path: string) => path.replace(/\.md$/, '').split('/').pop()!;
  const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
  const inFolder = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
  const summary = (n: MockNote): NoteSummary => ({
    id: n.id,
    title: titleOf(n.path),
    path: n.path,
    folder: folderOf(n.path),
    preview: plainTextOf(n.content).slice(0, 120),
    updatedAt: n.updatedAt,
  });
  const detail = (n: MockNote) => ({ ...structuredClone(n), title: titleOf(n.path) });
  const linked = (n: MockNote): LinkedNote => ({ noteId: n.id, title: titleOf(n.path) });
  const byRecent = (a: MockNote, b: MockNote) => b.updatedAt.localeCompare(a.updatedAt);
  const pathTaken = (path: string, exceptId?: string) =>
    [...notes.values()].some((n) => n.id !== exceptId && n.path.toLowerCase() === path.toLowerCase());
  const folderExists = (path: string) => path === '' || folders.has(path);
  const validName = (name: string) => Boolean(name) && !INVALID_NAME.test(name) && !name.startsWith('.');

  /** 옮겨진 노트를 가리키던 링크를 고친다 (UC-NOTE-010, 규칙은 Shared Kernel). */
  const relink = (before: MockNote[], moved: Map<string, string>) => {
    const afterPaths = [...notes.values()].map((n) => n.path);
    const updated: string[] = [];
    for (const note of notes.values()) {
      const next = rewriteLinkTargets(note.content, (target) => {
        const newPath = moved.get(resolveLinkTarget(target, before)?.id ?? '');
        if (!newPath) return null;
        return target.includes('/') ? newPath.replace(/\.md$/, '') : linkTargetFor(newPath, afterPaths);
      });
      if (next !== note.content) {
        note.content = next;
        updated.push(note.id);
      }
    }
    return updated;
  };
  const relocate = (note: MockNote, path: string) => {
    if (pathTaken(path, note.id)) return fail<never>('NOTE_TITLE_TAKEN', path);
    const before = [...notes.values()].map((n) => ({ ...n }));
    note.path = path;
    return ok({ note: summary(note), updatedNoteIds: relink(before, new Map([[note.id, path]])) });
  };

  if (options.controls) {
    options.controls.externalEdit = (noteId, content) => {
      const note = notes.get(noteId);
      if (!note) return;
      Object.assign(note, { content, updatedAt: now() });
      for (const listener of vaultListeners) listener({ noteIds: [noteId], structure: false });
    };
    options.controls.contentOf = (path) => [...notes.values()].find((n) => n.path === path)?.content;
  }

  const all: Capabilities = { generate: true, structuredOutput: true, webSearch: true };
  const noSearch: Capabilities = { generate: true, structuredOutput: true, webSearch: false };
  const catalog: Record<ProviderId, { id: string; label: string; capabilities: Capabilities }[]> = {
    openai: [
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (recommended)', capabilities: all },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (no Expand)', capabilities: noSearch },
    ],
    kimi: [
      { id: 'kimi-k2.6', label: 'Kimi K2.6 (recommended)', capabilities: all },
      { id: 'kimi-k3', label: 'Kimi K3', capabilities: all },
    ],
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
    vault: {
      getCurrent: () => ok(vault),
      choose: () => {
        vault = MOCK_VAULT;
        if (!recent.includes(MOCK_VAULT)) recent.unshift(MOCK_VAULT);
        return ok(vault);
      },
      open: ({ root }) => {
        const found = recent.find((v) => v.root === root);
        if (!found) return fail('VAULT_NOT_FOUND', root);
        vault = found;
        return ok(found);
      },
      listRecent: () => ok({ items: recent.map((v) => ({ ...v, exists: true })) }),
      onChanged: (listener) => {
        vaultListeners.add(listener);
        return () => vaultListeners.delete(listener);
      },
    },
    notes: {
      tree: () => {
        if (!vault) return notOpen();
        return ok({
          folders: [...folders].sort(),
          notes: [...notes.values()].sort((a, b) => a.path.localeCompare(b.path)).map(summary),
        });
      },
      create: ({ folder = '' }) => {
        if (!vault) return notOpen();
        if (!folderExists(folder)) return fail('FOLDER_NOT_FOUND', folder);
        let name = 'Untitled';
        for (let n = 2; pathTaken(inFolder(folder, `${name}.md`)); n++) name = `Untitled ${n}`;
        const at = now();
        const note: MockNote = { id: crypto.randomUUID(), path: inFolder(folder, `${name}.md`), content: '', createdAt: at, updatedAt: at };
        notes.set(note.id, note);
        return ok(detail(note));
      },
      get: ({ id }) => {
        const note = notes.get(id);
        return note ? ok(detail(note)) : fail('NOTE_NOT_FOUND', `Note ${id} not found`);
      },
      update: ({ id, content }) => {
        const note = notes.get(id);
        if (!note) return fail('NOTE_NOT_FOUND', `Note ${id} not found`);
        const changed = note.content !== content;
        if (changed) Object.assign(note, { content, updatedAt: now() });
        return ok({ id, updatedAt: note.updatedAt, changed });
      },
      rename: ({ id, title }) => {
        const note = notes.get(id);
        if (!note) return fail('NOTE_NOT_FOUND', id);
        const name = title.trim();
        if (!validName(name)) return fail('NOTE_TITLE_INVALID', title);
        return relocate(note, inFolder(folderOf(note.path), `${name}.md`));
      },
      move: ({ id, folder }) => {
        const note = notes.get(id);
        if (!note) return fail('NOTE_NOT_FOUND', id);
        if (!folderExists(folder)) return fail('FOLDER_NOT_FOUND', folder);
        return relocate(note, inFolder(folder, note.path.split('/').pop()!));
      },
      delete: ({ id }) => {
        notes.delete(id);
        return ok({ deleted: true as const });
      },
      search: ({ query, excludeNoteId, limit = 20 }) => {
        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (keywords.length === 0) return ok({ items: [] });
        const text = (n: MockNote) => `${titleOf(n.path)} ${plainTextOf(n.content)}`.toLowerCase();
        const titleHit = (n: MockNote) => Number(titleOf(n.path).toLowerCase().includes(keywords[0]!));
        const items = [...notes.values()]
          .filter((n) => n.id !== excludeNoteId && keywords.every((k) => text(n).includes(k)))
          .sort((a, b) => titleHit(b) - titleHit(a) || byRecent(a, b))
          .slice(0, limit)
          .map((n) => ({
            id: n.id,
            title: titleOf(n.path),
            path: n.path,
            snippet: plainTextOf(n.content).slice(0, 120),
            updatedAt: n.updatedAt,
          }));
        return ok({ items });
      },
      listLinks: ({ noteId }) => {
        const source = notes.get(noteId);
        if (!source) return fail('NOTE_NOT_FOUND', `Note ${noteId} not found`);
        const everyNote = [...notes.values()];
        const targetsOf = (n: MockNote) => extractLinkTargets(n.content).map((t) => resolveLinkTarget(t, everyNote)?.id);
        const outgoing = [...new Set(targetsOf(source))]
          .filter((id): id is string => id !== undefined && id !== noteId)
          .map((id) => linked(notes.get(id)!));
        const incoming = everyNote
          .filter((n) => n.id !== noteId && targetsOf(n).includes(noteId))
          .sort(byRecent)
          .map(linked);
        return ok({ outgoing, incoming });
      },
    },
    folders: {
      create: ({ parent = '', name }) => {
        if (!folderExists(parent)) return fail('FOLDER_NOT_FOUND', parent);
        const trimmed = name.trim();
        if (!validName(trimmed)) return fail('FOLDER_NAME_INVALID', name);
        const path = inFolder(parent, trimmed);
        if (folders.has(path)) return fail('FOLDER_NAME_TAKEN', path);
        folders.add(path);
        return ok({ path });
      },
      rename: ({ path, name }) => {
        if (!folders.has(path)) return fail('FOLDER_NOT_FOUND', path);
        const trimmed = name.trim();
        if (!validName(trimmed)) return fail('FOLDER_NAME_INVALID', name);
        const next = inFolder(folderOf(path), trimmed);
        if (folders.has(next)) return fail('FOLDER_NAME_TAKEN', next);
        const moveUnder = (p: string) => (p === path || p.startsWith(`${path}/`) ? next + p.slice(path.length) : p);
        for (const folder of [...folders]) {
          folders.delete(folder);
          folders.add(moveUnder(folder));
        }
        const before = [...notes.values()].map((n) => ({ ...n }));
        const moved = new Map<string, string>();
        for (const note of notes.values()) {
          const nextPath = moveUnder(note.path);
          if (nextPath !== note.path) {
            note.path = nextPath;
            moved.set(note.id, nextPath);
          }
        }
        return ok({ path: next, updatedNoteIds: relink(before, moved) });
      },
      delete: ({ path }) => {
        if (!folders.has(path)) return fail('FOLDER_NOT_FOUND', path);
        const inside = (p: string) => p === path || p.startsWith(`${path}/`);
        for (const folder of [...folders]) if (inside(folder)) folders.delete(folder);
        let deletedNotes = 0;
        for (const note of [...notes.values()]) {
          if (inside(note.path)) {
            notes.delete(note.id);
            deletedNotes++;
          }
        }
        return ok({ deletedNotes });
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
    organize: {
      preview: async ({ folder }) => {
        await options.organizeGate?.();
        return options.organizePreviewError
          ? fail<OrganizePlan>(options.organizePreviewError, 'mock preview failure')
          : ok<OrganizePlan>(options.organizePreview?.(folder) ?? { folder, newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' });
      },
      apply: (plan) => {
        const createdFolders: string[] = [];
        const failed: { id: string; title: string }[] = [];
        let movedNotes = 0;
        const ensure = (path: string) => {
          if (folders.has(path)) return;
          folders.add(path);
          createdFolders.push(path);
        };
        // 없는 노트는 «옮기지 못함»으로 알린다 (실제 앱에서 파일이 잠긴 경우를 흉내 냄)
        const moveTo = (planned: { id: string; title: string }, folder: string) => {
          const note = notes.get(planned.id);
          if (!note) {
            failed.push({ id: planned.id, title: planned.title });
            return;
          }
          note.path = inFolder(folder, note.path.split('/').pop()!);
          movedNotes += 1;
        };
        for (const group of plan.newFolders) {
          // 경로의 폴더를 위층부터 하나씩 만든다
          const path = group.path.reduce((parent, name) => {
            const child = inFolder(parent, name);
            ensure(child);
            return child;
          }, plan.folder);
          for (const note of group.notes) moveTo(note, path);
        }
        for (const move of plan.moves) {
          ensure(move.to);
          moveTo(move, move.to);
        }
        return ok({ movedNotes, createdFolders, updatedNoteIds: [], failed });
      },
      place: async ({ id }) => {
        await options.organizeGate?.();
        const note = notes.get(id);
        return note ? ok({ folder: folderOf(note.path), updatedNoteIds: [] }) : fail('NOTE_NOT_FOUND', id);
      },
      // 경로(= 파일 이름)에 `#fail`이 있으면 «다른 프로그램이 쓰는 중», `#noai`면 «AI 설정 없음»으로 실패한다
      importFile: ({ sourcePath, folder }) => {
        if (sourcePath.includes('#fail')) return fail('NOTE_IMPORT_LOCKED', `${sourcePath} is open in another program`);
        if (sourcePath.includes('#noai')) return fail('AI_PROVIDER_NOT_CONFIGURED', 'No usable AI provider is configured');
        const at = now();
        const note: MockNote = { id: crypto.randomUUID(), path: inFolder(folder, sourcePath), content: '', createdAt: at, updatedAt: at };
        notes.set(note.id, note);
        return ok({ noteId: note.id, folder, updatedNoteIds: [] });
      },
      pathForFile: (file) => file.name,
    },
  };
}
