// 패키징된 앱(설치본과 같은 파일) 실행 확인: node e2e/support/verify-packaged.mjs [Blink.exe 경로]
// 보관함 선택 화면 → 보관함 열기 → 노트 작성 → .md 파일·색인 DB 생성까지 본다. 실제 사용자 데이터에는 닿지 않는다.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright-core';

const exe = resolve(process.argv[2] ?? 'dist/win-unpacked/Blink.exe');
const base = mkdtempSync(join(tmpdir(), 'blink-packaged-'));
const userData = join(base, 'user-data');
const vault = join(base, 'vault');
mkdirSync(userData);
mkdirSync(vault);

const launch = () => _electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`] });
const check = (ok, message) => {
  if (!ok) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
};

try {
  // 1. 처음 실행: 보관함 선택 화면
  let app = await launch();
  let page = await app.firstWindow();
  await page.getByRole('heading', { name: '보관함 열기' }).waitFor({ timeout: 20_000 });
  check(true, 'first launch shows the vault picker');
  check(!(await app.evaluate(({ app: a }) => !a.isPackaged)), 'runs as a packaged app');
  await app.close();

  // 2. 마지막 보관함을 적어 두고 다시 실행 → 노트 작성
  writeFileSync(
    join(userData, 'app-config.json'),
    JSON.stringify({ lastVault: vault, recentVaults: [{ root: vault, openedAt: new Date().toISOString() }] }),
  );
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('button', { name: '새 노트' }).first().click();
  const title = page.getByRole('textbox', { name: '노트 제목' });
  await title.fill('설치본 확인');
  await title.press('Enter');
  await page.getByRole('region', { name: '노트 목록' }).getByRole('link', { name: '설치본 확인' }).waitFor();
  await page.getByRole('textbox', { name: '노트 본문' }).click();
  await page.keyboard.type('패키징된 앱에서 저장');
  await page.getByText('저장됨').waitFor({ timeout: 10_000 });
  check(readFileSync(join(vault, '설치본 확인.md'), 'utf8') === '패키징된 앱에서 저장', 'writes the note as a .md file');
  check(readdirSync(join(userData, 'vaults')).some((f) => f.endsWith('.db')), 'creates the SQLite index (better-sqlite3 loads)');
  check(existsSync(join(userData, 'blink.db')), 'creates the settings database');
  await page.getByRole('link', { name: '설정' }).click();
  await page.getByRole('form', { name: 'AI 설정' }).waitFor();
  check(true, 'opens the AI settings screen');
  await app.close();
  console.log('packaged app OK');
} finally {
  rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
