import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { IpcChannels, IpcEvents } from '../shared/ipc/channels';
import { EmptyRequest } from '../shared/ipc/schemas';
import { ActiveLLM } from './ai-provider/application/active-llm';
import { ProviderSettingsService } from './ai-provider/application/provider-settings-service';
import { DrizzleAIProviderSettingsRepository } from './ai-provider/infrastructure/drizzle-ai-provider-settings-repository';
import { createFakeLLMProviderFactory } from './ai-provider/infrastructure/fake-llm-provider';
import { createLLMProviderFactory } from './ai-provider/infrastructure/llm-provider-factory';
import { SafeStorageCipher } from './ai-provider/infrastructure/safe-storage-cipher';
import { settingsIpcHandlers } from './ai-provider/presentation/settings.ipc';
import { createCloseCoordinator } from './app/close-coordinator';
import { AIJobQueries } from './assist/application/ai-job-queries';
import { CreateAIJob } from './assist/application/create-ai-job';
import { ExpandExecutor } from './assist/application/executors/expand-executor';
import { OrganizeExecutor } from './assist/application/executors/organize-executor';
import { VisualizeExecutor } from './assist/application/executors/visualize-executor';
import { JobRunner } from './assist/application/job-runner';
import type { JobEventPublisher } from './assist/application/ports';
import { RecoverInterruptedJobs } from './assist/application/recover-interrupted-jobs';
import { RetryAIJob } from './assist/application/retry-ai-job';
import type { AIJobRepository } from './assist/domain/ai-job-repository';
import { DrizzleAIJobRepository } from './assist/infrastructure/drizzle-ai-job-repository';
import { SessionAIJobRepository } from './assist/infrastructure/session-ai-job-repository';
import { aiIpcHandlers } from './assist/presentation/ai.ipc';
import { VaultManager } from './note/application/vault/vault-manager';
import { JsonAppConfigStore } from './note/infrastructure/vault/app-config-store';
import { openNoteVault, type OpenedNoteVault } from './note/infrastructure/vault/open-note-vault';
import { noteIpcHandlers } from './note/presentation/note.ipc';
import { OrganizeService } from './organize/application/organize-service';
import { organizeIpcHandlers } from './organize/presentation/organize.ipc';
import { systemClock, uuid } from './platform/clock';
import { openDatabase } from './platform/db/connection';
import { runMigrations } from './platform/db/migrate';
import { migrations } from './platform/db/migrations';
import { createIpcHandler } from './platform/ipc/handler';
import { registerIpcHandlers } from './platform/ipc/register';
import { createSenderValidator } from './platform/ipc/sender';
import { ExportInfographicPng } from './visualization/application/export-infographic-png';
import { ElectronFileSaver, FixedPathFileSaver } from './visualization/infrastructure/electron-file-saver';
import { visualizationIpcHandlers } from './visualization/presentation/visualization.ipc';
import { createMainWindow } from './window';

const CLOSE_FLUSH_TIMEOUT_MS = 3000;

/** Composition Root. 순서는 docs/02-architecture.md "앱 시작 순서"를 따른다. */
export function bootstrap(): { openWindow: () => BrowserWindow } {
  const userData = app.getPath('userData');
  const broadcast = (channel: string, payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
  };

  // 1. 앱 설정 DB 열기 → 마이그레이션 (AI 공급자 설정. 노트는 보관함 폴더가 원본, D-14)
  const database = openDatabase(join(userData, 'blink.db'));
  runMigrations(database.sqlite, migrations);

  // 2. 의존성 조립
  type AppVaultSession = OpenedNoteVault & { jobs: AIJobRepository };
  const vaults = new VaultManager<AppVaultSession>({
    config: new JsonAppConfigStore(join(userData, 'app-config.json')),
    clock: systemClock,
    isDirectory: (root) => statSync(root, { throwIfNoEntry: false })?.isDirectory() ?? false,
    openSession: (root) => {
      const vault = openNoteVault(root, { indexDir: join(userData, 'vaults'), clock: systemClock, nextId: uuid });
      const jobs = new DrizzleAIJobRepository(vault.database.db);
      // 중단된 AI Job 정리 (UC-ASSIST-006) — Renderer가 이 보관함의 중간 상태를 보기 전에
      new RecoverInterruptedJobs(jobs, systemClock).execute();
      return { ...vault, jobs };
    },
    onChanged: (event) => broadcast(IpcEvents.vaultChanged, event),
  });
  app.on('will-quit', () => {
    vaults.close();
    database.close();
  });
  // E2E는 Dialog를 띄울 수 없어 고른 폴더를 환경 변수로 받는다 (개발 빌드 전용).
  const e2eVaultChoice = app.isPackaged ? undefined : process.env.BLINK_E2E_VAULT_CHOICE;
  const chooseFolder = async () => {
    if (e2eVaultChoice) return e2eVaultChoice;
    const options: Electron.OpenDialogOptions = { title: '보관함 폴더 선택', properties: ['openDirectory', 'createDirectory'] };
    const window = BrowserWindow.getFocusedWindow();
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  const providerRepo = new DrizzleAIProviderSettingsRepository(database.db);
  const cipher = new SafeStorageCipher();
  // E2E·수동 확인용 가짜 LLM은 개발 빌드에서 명시적으로 켰을 때만 쓴다.
  const useFakeLLM = !app.isPackaged && process.env.BLINK_FAKE_LLM === '1';
  const llmFactory = useFakeLLM ? createFakeLLMProviderFactory() : createLLMProviderFactory();
  const providerSettings = new ProviderSettingsService(providerRepo, cipher, llmFactory, systemClock);
  const activeLLM = new ActiveLLM(providerRepo, cipher, llmFactory);
  const organize = new OrganizeService({
    notes: () => vaults.session().notes,
    folders: () => vaults.session().folders,
    activeLLM,
  });

  const jobRepo = new SessionAIJobRepository(() => vaults.session().jobs);
  const publisher: JobEventPublisher = { jobUpdated: (view) => broadcast(IpcEvents.aiJobUpdated, view) };
  const runner = new JobRunner({
    repo: jobRepo,
    activeLLM,
    executors: { ORGANIZE: new OrganizeExecutor(), EXPAND: new ExpandExecutor(), VISUALIZE: new VisualizeExecutor() },
    publisher,
    clock: systemClock,
    logger: console,
  });

  const e2eSavePath = app.isPackaged ? undefined : process.env.BLINK_E2E_SAVE_PATH;
  const exportPng = new ExportInfographicPng(e2eSavePath ? new FixedPathFileSaver(e2eSavePath) : new ElectronFileSaver());

  // 3. 마지막 보관함 다시 열기 (UC-VAULT-003). 못 열면 Renderer가 선택 화면을 보여 준다.
  vaults.restoreLast();

  // 창마다 하나. 현재는 단일 창이라 가장 최근 창의 coordinator에 release를 전달한다.
  let releaseClose = () => {};

  // 4. IPC 등록
  const isTrusted = createSenderValidator({
    devServerUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
  });
  registerIpcHandlers(
    ipcMain,
    {
      [IpcChannels.appGetInfo]: createIpcHandler(EmptyRequest, () => ({ version: app.getVersion() })),
      [IpcChannels.appReadyToClose]: createIpcHandler(EmptyRequest, () => releaseClose()),
      ...noteIpcHandlers({ vaults, chooseFolder }),
      ...settingsIpcHandlers(providerSettings),
      ...aiIpcHandlers({
        create: new CreateAIJob({ repo: jobRepo, notes: { exists: (id) => vaults.session().notes.exists(id) }, activeLLM, runner, clock: systemClock }),
        retry: new RetryAIJob({ repo: jobRepo, activeLLM, runner, clock: systemClock, publisher }),
        queries: new AIJobQueries(jobRepo),
      }),
      ...visualizationIpcHandlers(exportPng),
      ...organizeIpcHandlers(organize),
    },
    isTrusted,
  );

  // 5. 창 생성 — Renderer의 첫 호출이 유실되지 않도록 IPC 등록 후에 만든다.
  const openWindow = () => {
    const window = createMainWindow();
    const coordinator = createCloseCoordinator(window, { timeoutMs: CLOSE_FLUSH_TIMEOUT_MS });
    releaseClose = () => coordinator.release();
    return window;
  };
  openWindow();
  return { openWindow };
}
