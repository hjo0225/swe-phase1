import electronPath from 'electron';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright-core';

const repoRoot = resolve(__dirname, '../..');

/**
 * 테스트마다 격리된 userData(= 설정·색인 DB 위치)와 보관함 폴더를 쓴다. 실제 사용자 데이터에 닿지 않는다.
 * 마지막 보관함을 app-config.json에 미리 적어 두어 앱이 선택 화면 없이 보관함을 연다.
 */
export function createUserDataDir(): { dir: string; vault: string; cleanup(): void } {
  const base = mkdtempSync(join(tmpdir(), 'blink-e2e-'));
  const dir = join(base, 'user-data');
  const vault = join(base, 'vault');
  mkdirSync(dir);
  mkdirSync(vault);
  writeFileSync(
    join(dir, 'app-config.json'),
    JSON.stringify({ lastVault: vault, recentVaults: [{ root: vault, openedAt: new Date().toISOString() }] }),
  );
  // Windows는 종료 직후 SQLite 파일 잠금이 잠깐 남을 수 있어 재시도한다.
  return { dir, vault, cleanup: () => rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

/** `pnpm build` 결과(out/)를 실제 Electron으로 실행한다. */
export async function launchApp(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  delete env.ELECTRON_RENDERER_URL; // 번들된 renderer(file://)를 로드하게 한다
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, extraEnv);
  const app = await _electron.launch({
    executablePath: electronPath as unknown as string,
    args: [repoRoot, `--user-data-dir=${userDataDir}`],
    cwd: repoRoot,
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/** 사용자가 창을 닫는 것과 같은 경로(BrowserWindow.close → close 이벤트)로 닫고 프로세스 종료를 기다린다. */
export async function closeLikeUser(app: ElectronApplication): Promise<void> {
  const exited = new Promise<void>((resolveExit) => app.process().once('exit', () => resolveExit()));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await exited;
}
