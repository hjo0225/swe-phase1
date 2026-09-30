# Stage 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron + React 앱이 Cloud Glass 셸로 뜨고, Renderer → Preload → Main IPC 왕복(Result Envelope)과 SQLite 연결이 실제로 동작하는 기반을 만든다.

**Architecture:** electron-vite로 main / preload / renderer 3개 번들을 만든다. Main은 `platform/`(DB, IPC 헬퍼)과 `bootstrap.ts`(조립)만 가진다. IPC는 `app:get-info` 채널 하나로 전체 경로(Zod 검증 → Envelope → contextBridge → Renderer unwrap)를 검증한다.

**Tech Stack:** pnpm 11, Electron 44, electron-vite 5, Vite 7, React 19, TypeScript 6, React Router 8 (Hash), TanStack Query 5, Zod 4, better-sqlite3 13 (N-API prebuild), drizzle-orm 0.45, Vitest 5 + jsdom + Testing Library.

**Spec:** `docs/02-architecture.md`, `docs/04-api-conventions.md`, `docs/05-cross-cutting.md`, `docs/frontend/feature-map.md`, `docs/frontend/route-map.md`, `docs/frontend/design-system.md`

## Global Constraints

- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` (05-cross-cutting)
- IPC: `invoke`/`handle`만, 채널당 객체 하나, 응답은 `{ ok: true, data } | { ok: false, error: { code, message, details? } }` (04)
- 공통 오류 코드: `VALIDATION_FAILED`, `INTERNAL_ERROR` (04)
- DB: `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, 파일 `app.getPath('userData')/blink.db` (05, note/persistence)
- 도메인/애플리케이션 코드에서 `electron`, `drizzle-orm`, `better-sqlite3` import 금지 — Stage 1은 platform 코드만 존재 (02)
- Hash Router, 라우트 `#/`, `#/notes/:noteId`, `#/settings/ai`, `*` → `#/` (route-map)
- 폰트 로컬 번들, CSP `'self'` (design-system)
- 커밋 메시지: `<type>: <english summary>`

## 사전 확인 결과 (2026-09-30)

| 확인 | 결과 |
| --- | --- |
| better-sqlite3 13 in Electron 44 (Node 24) | 패키지 내 N-API prebuild(`prebuilds/win32-x64.node`) 로드 성공, rebuild 불필요 |
| pnpm 11 install scripts | 기본 차단 → `pnpm-workspace.yaml`의 `allowBuilds`에 `better-sqlite3`, `electron`, `esbuild` 허용 |
| Electron 바이너리 | 44부터 install 시 받지 않고 `require('electron')` 시점에 다운로드. electron-vite 5는 `path.txt`만 보고 다운로드를 유발하지 않아 "Electron uninstall" 오류 → 루트 `postinstall: node -e "require('electron')"`로 해결 (실행 중 발견) |
| electron-vite 5 | peer `vite ^5 \|\| ^6 \|\| ^7` → Vite 7, `@vitejs/plugin-react` 5 |
| TypeScript | 7은 네이티브 포트 → 도구 호환 위해 6 |
| contextBridge | Error의 커스텀 속성(`code`)을 복사하지 않음 → **Preload는 Envelope를 그대로 반환, Renderer가 unwrap** (04 문서 수정) |

## File Structure

```text
package.json, pnpm-workspace.yaml, .gitignore
tsconfig.json, tsconfig.node.json, tsconfig.web.json
electron.vite.config.ts, vitest.config.ts, vitest.setup.ts
src/shared/ipc/
  result.ts            IpcResult, IpcError, BlinkErrorCode
  errors.ts            BlinkIpcError, unwrap()
  channels.ts          IpcChannels
  schemas.ts           요청 Zod 스키마
  blink-api.ts         BlinkApi, RawBlinkApi, AppInfo
src/main/
  index.ts             app 수명주기
  bootstrap.ts         조립: DB → IPC → window
  window.ts            BrowserWindow 생성, 네비게이션 차단, 캡처 훅(개발용)
  platform/errors.ts   DomainError
  platform/ipc/handler.ts        createIpcHandler
  platform/ipc/sender.ts         createSenderValidator
  platform/ipc/register.ts       registerIpcHandler
  platform/db/connection.ts      openDatabase
src/preload/
  index.ts             contextBridge.exposeInMainWorld
  raw-api.ts           createRawBlinkApi(invoke)
src/renderer/
  index.html, main.tsx, env.d.ts
  app/App.tsx, app/router.tsx, app/AppShell.tsx(+.module.css), app/Sidebar.tsx(+.module.css), app/placeholders.tsx
  shared/api/blink.ts  wrapRawApi, getBlink
  shared/ui/tokens.css, shared/ui/base.css
  mocks/createMockBlink.ts
```

---

### Task 1: IPC Result Envelope와 Main 핸들러 (+ 툴체인)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig*.json`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `src/shared/ipc/result.ts`, `src/main/platform/errors.ts`, `src/main/platform/ipc/handler.ts`
- Test: `src/main/platform/ipc/handler.test.ts`

**Interfaces:**
- Produces: `IpcResult<T>`, `IpcError`, `BlinkErrorCode`; `DomainError(code, message, details?)`; `createIpcHandler<I, O>(schema: ZodType<I>, run: (input: I) => O | Promise<O>, logger?: { error(...a: unknown[]): void }): (raw: unknown) => Promise<IpcResult<O>>`

- [ ] **Step 1: 툴체인 설치**

```bash
pnpm add react@19 react-dom@19 react-router@8 @tanstack/react-query@5 zod@4 better-sqlite3@13 drizzle-orm@0.45 @fontsource-variable/inter pretendard lucide-react
pnpm add -D electron@44 electron-vite@5 vite@7 @vitejs/plugin-react@5 typescript@6 @types/node@24 @types/react@19 @types/react-dom@19 @types/better-sqlite3 vitest@5 jsdom @testing-library/react @testing-library/jest-dom
```

`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  better-sqlite3: true
  electron: true
  esbuild: true
```

- [ ] **Step 2: 실패하는 테스트 작성** — `handler.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createIpcHandler } from './handler';
import { DomainError } from '../errors';

const schema = z.object({ name: z.string().min(1) });

describe('createIpcHandler', () => {
  it('returns ok envelope with the use case result', async () => {
    const handler = createIpcHandler(schema, ({ name }) => `hi ${name}`);
    await expect(handler({ name: 'blink' })).resolves.toEqual({ ok: true, data: 'hi blink' });
  });

  it('awaits async use cases', async () => {
    const handler = createIpcHandler(schema, async ({ name }) => name.length);
    await expect(handler({ name: 'abc' })).resolves.toEqual({ ok: true, data: 3 });
  });

  it('maps schema failures to VALIDATION_FAILED with field paths, without running the use case', async () => {
    const run = vi.fn();
    const result = await createIpcHandler(schema, run)({ name: '' });
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    if (!result.ok) expect(result.error.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('maps DomainError to its code, message and details', async () => {
    const handler = createIpcHandler(schema, () => {
      throw new DomainError('VALIDATION_FAILED', 'domain says no', { max: 3 });
    });
    await expect(handler({ name: 'x' })).resolves.toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'domain says no', details: { max: 3 } },
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs them', async () => {
    const logger = { error: vi.fn() };
    const boom = new Error('SQLITE_CONSTRAINT: secret detail');
    const result = await createIpcHandler(schema, () => { throw boom; }, logger)({ name: 'x' });
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
    expect(logger.error).toHaveBeenCalledWith(boom);
  });
});
```

- [ ] **Step 3: 실패 확인** — `pnpm vitest run src/main/platform/ipc/handler.test.ts` → FAIL (모듈 없음)

- [ ] **Step 4: 구현**

`src/shared/ipc/result.ts`

```ts
export type CommonErrorCode = 'VALIDATION_FAILED' | 'INTERNAL_ERROR';
/** 도메인이 구현될 때마다 도메인 오류 코드 union을 여기에 합친다. */
export type BlinkErrorCode = CommonErrorCode;

export interface IpcError {
  code: BlinkErrorCode;
  message: string;
  details?: unknown;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
```

`src/main/platform/errors.ts`

```ts
import type { BlinkErrorCode } from '../../shared/ipc/result';

export class DomainError extends Error {
  constructor(
    readonly code: BlinkErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
```

`src/main/platform/ipc/handler.ts`

```ts
import type { ZodType } from 'zod';
import type { IpcResult } from '../../../shared/ipc/result';
import { DomainError } from '../errors';

export interface ErrorLogger { error(...args: unknown[]): void }

export function createIpcHandler<I, O>(
  schema: ZodType<I>,
  run: (input: I) => O | Promise<O>,
  logger: ErrorLogger = console,
): (raw: unknown) => Promise<IpcResult<O>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request',
          details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      };
    }
    try {
      return { ok: true, data: await run(parsed.data) };
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
        };
      }
      logger.error(error);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } };
    }
  };
}
```

- [ ] **Step 5: 통과 확인** — 같은 명령 → 5 passed, `pnpm typecheck` 통과
- [ ] **Step 6: Commit** — `feat: add ipc result envelope and main handler`

### Task 2: SQLite 연결

**Files:**
- Create: `src/main/platform/db/connection.ts`
- Test: `src/main/platform/db/connection.test.ts`

**Interfaces:**
- Produces: `openDatabase(filename: string): Database` where `Database = { sqlite: BetterSqlite3.Database; db: BetterSQLite3Database; close(): void }`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './connection';

describe('openDatabase', () => {
  let dir: string;
  let database: Database | undefined;
  afterEach(() => {
    database?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('enables foreign keys and WAL on a file database', () => {
    dir = mkdtempSync(join(tmpdir(), 'blink-db-'));
    database = openDatabase(join(dir, 'blink.db'));
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('enforces foreign key constraints', () => {
    dir = mkdtempSync(join(tmpdir(), 'blink-db-'));
    database = openDatabase(join(dir, 'blink.db'));
    database.sqlite.exec('CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (pid TEXT REFERENCES p(id));');
    expect(() => database!.sqlite.prepare("INSERT INTO c VALUES ('missing')").run()).toThrow(/FOREIGN KEY/);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL (모듈 없음)
- [ ] **Step 3: 구현**

```ts
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export interface Database {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database;
  close(): void;
}

export function openDatabase(filename: string): Database {
  const sqlite = new BetterSqlite3(filename);
  sqlite.pragma('journal_mode = WAL');
  // SQLite 기본값은 OFF. 연결마다 켜야 ON DELETE CASCADE가 동작한다.
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle(sqlite), close: () => sqlite.close() };
}
```

- [ ] **Step 4: 통과 확인** → 2 passed
- [ ] **Step 5: Commit** — `feat: add sqlite connection with foreign keys and wal`

Drizzle 스키마·마이그레이션(drizzle-kit)은 첫 테이블이 생기는 Stage 2에서 추가한다.

### Task 3: Preload Raw API와 Renderer unwrap 클라이언트

**Files:**
- Create: `src/shared/ipc/errors.ts`, `src/shared/ipc/channels.ts`, `src/shared/ipc/schemas.ts`, `src/shared/ipc/blink-api.ts`
- Create: `src/preload/raw-api.ts`, `src/renderer/shared/api/blink.ts`, `src/renderer/mocks/createMockBlink.ts`
- Test: `src/preload/raw-api.test.ts`, `src/renderer/shared/api/blink.test.ts`

**Interfaces:**
- Produces:
  - `IpcChannels.appGetInfo = 'app:get-info'`
  - `AppInfo = { version: string }`, `BlinkApi = { app: { getInfo(): Promise<AppInfo> } }`
  - `RawBlinkApi` — BlinkApi의 Promise 반환 메서드를 `Promise<IpcResult<R>>`로 바꾼 타입
  - `BlinkIpcError(code, message, details?)`, `unwrap<T>(r: IpcResult<T>): T`
  - `createRawBlinkApi(invoke: (channel: string, request: unknown) => Promise<unknown>): RawBlinkApi`
  - `wrapRawApi(raw: RawBlinkApi): BlinkApi`, `getBlink(): BlinkApi`, `resetBlinkForTests(): void`
  - `createMockBlink(): RawBlinkApi`

- [ ] **Step 1: 실패하는 테스트** — `raw-api.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRawBlinkApi } from './raw-api';

describe('createRawBlinkApi', () => {
  it('invokes whitelisted channels with a single request object and returns the envelope untouched', async () => {
    const envelope = { ok: false, error: { code: 'INTERNAL_ERROR', message: 'x' } };
    const invoke = vi.fn().mockResolvedValue(envelope);
    const api = createRawBlinkApi(invoke);
    await expect(api.app.getInfo()).resolves.toBe(envelope);
    expect(invoke).toHaveBeenCalledWith('app:get-info', {});
  });
});
```

`blink.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BlinkIpcError } from '../../../shared/ipc/errors';
import type { RawBlinkApi } from '../../../shared/ipc/blink-api';
import { getBlink, resetBlinkForTests, wrapRawApi } from './blink';

const rawReturning = (result: unknown): RawBlinkApi =>
  ({ app: { getInfo: async () => result } }) as RawBlinkApi;

describe('wrapRawApi', () => {
  it('unwraps ok envelopes to data', async () => {
    const api = wrapRawApi(rawReturning({ ok: true, data: { version: '1.2.3' } }));
    await expect(api.app.getInfo()).resolves.toEqual({ version: '1.2.3' });
  });

  it('throws BlinkIpcError carrying the error code for failed envelopes', async () => {
    const api = wrapRawApi(rawReturning({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'bad', details: [1] } }));
    const error = await api.app.getInfo().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BlinkIpcError);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'bad', details: [1] });
  });
});

describe('getBlink', () => {
  afterEach(() => {
    delete (window as { blink?: unknown }).blink;
    resetBlinkForTests();
  });

  it('uses window.blink when the preload exposed it', async () => {
    (window as { blink?: unknown }).blink = rawReturning({ ok: true, data: { version: 'preload' } });
    await expect(getBlink().app.getInfo()).resolves.toEqual({ version: 'preload' });
  });

  it('falls back to the in-memory mock outside Electron', async () => {
    await expect(getBlink().app.getInfo()).resolves.toEqual({ version: 'mock' });
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL (모듈 없음)
- [ ] **Step 3: 구현**

`src/shared/ipc/errors.ts`

```ts
import type { BlinkErrorCode, IpcResult } from './result';

export class BlinkIpcError extends Error {
  constructor(readonly code: BlinkErrorCode, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'BlinkIpcError';
  }
}

export function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw new BlinkIpcError(result.error.code, result.error.message, result.error.details);
}
```

`src/shared/ipc/channels.ts`

```ts
export const IpcChannels = {
  appGetInfo: 'app:get-info',
} as const;
```

`src/shared/ipc/schemas.ts`

```ts
import { z } from 'zod';

export const EmptyRequest = z.object({}).strict();
```

`src/shared/ipc/blink-api.ts`

```ts
import type { IpcResult } from './result';

export interface AppInfo { version: string }

/** Renderer가 쓰는 API. 실패 시 BlinkIpcError를 throw 한다. */
export interface BlinkApi {
  app: { getInfo(): Promise<AppInfo> };
}

type RawMethod<F> = F extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<IpcResult<R>> : F;

/** Preload가 노출하는 API. contextBridge는 Error의 code를 보존하지 않으므로 Envelope를 그대로 넘긴다. */
export type RawBlinkApi = { [N in keyof BlinkApi]: { [M in keyof BlinkApi[N]]: RawMethod<BlinkApi[N][M]> } };
```

`src/preload/raw-api.ts`

```ts
import type { AppInfo, RawBlinkApi } from '../shared/ipc/blink-api';
import { IpcChannels } from '../shared/ipc/channels';
import type { IpcResult } from '../shared/ipc/result';

export type Invoke = (channel: string, request: unknown) => Promise<unknown>;

export function createRawBlinkApi(invoke: Invoke): RawBlinkApi {
  const call = <T>(channel: string, request: unknown) => invoke(channel, request) as Promise<IpcResult<T>>;
  return {
    app: { getInfo: () => call<AppInfo>(IpcChannels.appGetInfo, {}) },
  };
}
```

`src/renderer/shared/api/blink.ts`

```ts
import type { BlinkApi, RawBlinkApi } from '../../../shared/ipc/blink-api';
import { unwrap } from '../../../shared/ipc/errors';
import type { IpcResult } from '../../../shared/ipc/result';
import { createMockBlink } from '../../mocks/createMockBlink';

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

export function wrapRawApi(raw: RawBlinkApi): BlinkApi {
  const wrapped: Record<string, Record<string, unknown>> = {};
  for (const [namespace, methods] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    wrapped[namespace] = {};
    for (const [name, method] of Object.entries(methods)) {
      if (typeof method !== 'function') continue;
      wrapped[namespace][name] = (...args: unknown[]) => {
        const result = (method as (...a: unknown[]) => unknown)(...args);
        // 이벤트 구독(unsubscribe 반환)처럼 Promise가 아닌 반환값은 그대로 둔다.
        return isThenable(result) ? Promise.resolve(result).then((r) => unwrap(r as IpcResult<unknown>)) : result;
      };
    }
  }
  return wrapped as unknown as BlinkApi;
}

let client: BlinkApi | undefined;

export function getBlink(): BlinkApi {
  client ??= wrapRawApi(window.blink ?? createMockBlink());
  return client;
}

export function resetBlinkForTests(): void {
  client = undefined;
}
```

`src/renderer/mocks/createMockBlink.ts`

```ts
import type { RawBlinkApi } from '../../shared/ipc/blink-api';

/** 백엔드 없이 Renderer를 띄우기 위한 in-memory 구현. 실제 Preload와 같은 Envelope를 반환한다. */
export function createMockBlink(): RawBlinkApi {
  return {
    app: { getInfo: async () => ({ ok: true, data: { version: 'mock' } }) },
  };
}
```

`src/renderer/env.d.ts`

```ts
import type { RawBlinkApi } from '../shared/ipc/blink-api';

declare global {
  interface Window { blink?: RawBlinkApi }
}
export {};
```

- [ ] **Step 4: 통과 확인** → 5 passed, typecheck 통과
- [ ] **Step 5: Commit** — `feat: add preload raw api and renderer ipc client`

### Task 4: Main 프로세스 조립 (창, 발신자 검증, 부트스트랩)

**Files:**
- Create: `src/main/platform/ipc/sender.ts`, `src/main/platform/ipc/register.ts`, `src/main/window.ts`, `src/main/bootstrap.ts`, `src/main/index.ts`, `src/preload/index.ts`, `electron.vite.config.ts`
- Test: `src/main/platform/ipc/sender.test.ts`

**Interfaces:**
- Consumes: `createIpcHandler`, `openDatabase`, `createRawBlinkApi`, `IpcChannels`, `EmptyRequest`
- Produces: `createSenderValidator({ devServerUrl?: string }): (frameUrl: string | undefined) => boolean`, `registerIpcHandler(ipcMain, channel, handler, isTrustedFrameUrl)`

- [ ] **Step 1: 실패하는 테스트** — `sender.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createSenderValidator } from './sender';

describe('createSenderValidator', () => {
  it('accepts the app bundle loaded from file:// in production', () => {
    const isTrusted = createSenderValidator({});
    expect(isTrusted('file:///C:/Program%20Files/Blink/resources/app.asar/out/renderer/index.html#/notes/1')).toBe(true);
  });

  it('accepts only the dev server origin in development', () => {
    const isTrusted = createSenderValidator({ devServerUrl: 'http://localhost:5173' });
    expect(isTrusted('http://localhost:5173/#/')).toBe(true);
    expect(isTrusted('http://localhost:5174/#/')).toBe(false);
    expect(isTrusted('file:///C:/x/index.html')).toBe(false);
  });

  it('rejects remote pages, missing frames and garbage', () => {
    const isTrusted = createSenderValidator({});
    expect(isTrusted('https://evil.example/')).toBe(false);
    expect(isTrusted(undefined)).toBe(false);
    expect(isTrusted('not a url')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

`src/main/platform/ipc/sender.ts`

```ts
/** IPC 발신 프레임이 앱 자신의 Renderer인지 확인한다 (05-cross-cutting). */
export function createSenderValidator(options: { devServerUrl?: string }) {
  const devOrigin = options.devServerUrl ? new URL(options.devServerUrl).origin : undefined;
  return (frameUrl: string | undefined): boolean => {
    if (!frameUrl) return false;
    let url: URL;
    try {
      url = new URL(frameUrl);
    } catch {
      return false;
    }
    return devOrigin ? url.origin === devOrigin : url.protocol === 'file:';
  };
}
```

`src/main/platform/ipc/register.ts`

```ts
import type { IpcMain } from 'electron';
import type { IpcResult } from '../../../shared/ipc/result';

export function registerIpcHandler(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  handler: (raw: unknown) => Promise<IpcResult<unknown>>,
  isTrustedFrameUrl: (url: string | undefined) => boolean,
): void {
  ipcMain.handle(channel, (event, raw: unknown) => {
    if (!isTrustedFrameUrl(event.senderFrame?.url)) {
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Untrusted sender' } } satisfies IpcResult<never>;
    }
    return handler(raw);
  });
}
```

`src/main/window.ts`

```ts
import { app, BrowserWindow, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F3F8FF',
    title: 'Blink',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));

  captureForSmokeTest(window);
  return window;
}

/** 개발 전용: BLINK_CAPTURE=<png 경로>로 실행하면 첫 화면을 저장하고 종료한다 (시각 검증용). */
function captureForSmokeTest(window: BrowserWindow): void {
  const target = process.env.BLINK_CAPTURE;
  if (app.isPackaged || !target) return;
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const image = await window.webContents.capturePage();
      await writeFile(target, image.toPNG());
      app.quit();
    }, 1500);
  });
}
```

`src/main/bootstrap.ts`

```ts
import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc/channels';
import { EmptyRequest } from '../shared/ipc/schemas';
import { openDatabase } from './platform/db/connection';
import { createIpcHandler } from './platform/ipc/handler';
import { registerIpcHandler } from './platform/ipc/register';
import { createSenderValidator } from './platform/ipc/sender';
import { createMainWindow } from './window';

export function bootstrap(): void {
  const database = openDatabase(join(app.getPath('userData'), 'blink.db'));
  app.on('will-quit', () => database.close());

  const isTrusted = createSenderValidator({
    devServerUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  });
  registerIpcHandler(
    ipcMain,
    IpcChannels.appGetInfo,
    createIpcHandler(EmptyRequest, () => ({ version: app.getVersion() })),
    isTrusted,
  );

  // IPC 등록 후에 창을 만든다 (02-architecture 앱 시작 순서)
  createMainWindow();
}
```

`src/main/index.ts`

```ts
import { app, BrowserWindow } from 'electron';
import { bootstrap } from './bootstrap';
import { createMainWindow } from './window';

void app.whenReady().then(() => {
  bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

`src/preload/index.ts`

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { createRawBlinkApi } from './raw-api';

contextBridge.exposeInMainWorld('blink', createRawBlinkApi((channel, request) => ipcRenderer.invoke(channel, request)));
```

`electron.vite.config.ts`

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] },
});
```

(electron-vite 5의 의존성 외부화 기본값을 설치 후 타입 정의로 확인하고, `better-sqlite3`가 main 번들에 포함되지 않도록 한다.)

- [ ] **Step 4: 통과 확인** — sender 테스트 3 passed, `pnpm typecheck`, `pnpm build` 성공, `out/main/index.js`에 `require("better-sqlite3")`가 남아 있음
- [ ] **Step 5: Commit** — `feat: wire electron main process with secure window and ipc`

### Task 5: Renderer 셸 (라우트, Cloud Glass 토큰, Sidebar)

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/app/App.tsx`, `src/renderer/app/router.tsx`, `src/renderer/app/AppShell.tsx`, `src/renderer/app/AppShell.module.css`, `src/renderer/app/Sidebar.tsx`, `src/renderer/app/Sidebar.module.css`, `src/renderer/app/placeholders.tsx`, `src/renderer/shared/ui/tokens.css`, `src/renderer/shared/ui/base.css`
- Test: `src/renderer/app/App.test.tsx`

**Interfaces:**
- Consumes: `getBlink()`
- Produces: `App` (QueryClientProvider + RouterProvider), `routes` (라우트 정의 배열), `AppShell`, `Sidebar`

- [ ] **Step 1: 실패하는 테스트** — `App.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetBlinkForTests } from '../shared/api/blink';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    window.location.hash = '';
    resetBlinkForTests();
  });

  it('renders the sidebar and the start screen at #/', async () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Blink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /설정/ })).toHaveAttribute('href', '#/settings/ai');
    expect(await screen.findByText('v mock')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
  });

  it('renders the AI settings screen at #/settings/ai', () => {
    window.location.hash = '#/settings/ai';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI 설정' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the start screen', () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(screen.getByRole('heading', { name: /첫 노트/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — 라우트(`createHashRouter`), `AppShell`(배경 + Sidebar + Outlet), `Sidebar`(`<nav aria-label="Blink">`, 새 노트 버튼(비활성, Stage 2), 검색 버튼(비활성), AI 상태 칩 "AI 설정 필요", 설정 링크, 버전 캡션 `v{version}` ← `useQuery(['app','info'], getBlink().app.getInfo)`), placeholder 화면(`#/` "첫 노트를 만들어 보세요", `#/notes/:noteId` 노트 ID 표시, `#/settings/ai` "AI 설정"). 토큰·배경·glass 클래스는 `docs/frontend/design-system.md`의 값을 그대로 쓴다. `index.html` CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:`.
- [ ] **Step 4: 통과 확인** — 3 passed, typecheck, build
- [ ] **Step 5: 실제 앱 확인** — `pnpm build` 후 `BLINK_CAPTURE=<scratch>/stage1.png pnpm start` → PNG에 Cloud Glass 배경, glass Sidebar, 버전 캡션(`v0.1.0`)이 보이는지 확인 (IPC 왕복 증명). `pnpm dev`도 실행해 CSP 위반 없이 뜨는지 확인.
- [ ] **Step 6: Commit** — `feat: add renderer shell with cloud glass tokens and routes`

### Task 6: 문서 동기화

**Files:**
- Modify: `docs/04-api-conventions.md` (Preload API 모양 · Envelope 절: unwrap 위치를 Renderer 클라이언트로, `app:get-info` 채널 추가)
- Modify: `docs/00-overview.md` D-06 이유에 contextBridge 추가
- Modify: `docs/frontend/feature-map.md` Data Access 절 오류 처리 문장
- Modify: `README.md` 실행 방법

- [ ] **Step 1: 수정 후 링크 검사**
- [ ] **Step 2: Commit** — `fix: sync ipc docs with contextbridge error handling`

---

## Self-Review

- Spec coverage: 보안 BrowserWindow(T4), 발신자 검증(T4), Envelope/공통 코드(T1), Renderer unwrap(T3), Mock(T3), DB PRAGMA(T2), 앱 시작 순서(T4), 라우트 3개 + redirect(T5), 토큰/배경/glass/폰트/CSP(T5). 앱 종료 flush(D-12)와 drizzle-kit 마이그레이션은 Stage 2 범위로 명시.
- 타입 일관성: `RawBlinkApi`/`BlinkApi`/`AppInfo`는 T3에서 정의, T4 preload·T5 Sidebar가 같은 이름 사용. `createIpcHandler(schema, run, logger)` 시그니처 T1 = T4.
