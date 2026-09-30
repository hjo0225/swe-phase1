import type {
  CreateNoteInput,
  NoteDetail,
  NoteId,
  NoteLinks,
  NoteSearchHit,
  NoteSummary,
  SearchNotesInput,
  UpdateNoteInput,
  UpdateNoteResult,
} from './notes';
import type {
  ProviderSettingsView,
  TestProviderInput,
  TestProviderResult,
  UpdateProviderInput,
} from './ai-provider';
import type { AIJobView, CreateJobInput, JobId } from './assist';
import type { IpcResult } from './result';

export interface AppInfo {
  version: string;
}

/** Renderer 코드가 쓰는 API. 실패하면 BlinkIpcError를 throw 한다. */
export interface BlinkApi {
  app: {
    getInfo(): Promise<AppInfo>;
    /** 창을 닫기 직전 Main이 보내는 flush 요청. 해제 함수를 반환한다. */
    onWillClose(listener: () => void): () => void;
    readyToClose(): Promise<void>;
  };
  notes: {
    create(input: CreateNoteInput): Promise<NoteDetail>;
    list(): Promise<{ items: NoteSummary[] }>;
    get(input: { id: NoteId }): Promise<NoteDetail>;
    update(input: UpdateNoteInput): Promise<UpdateNoteResult>;
    delete(input: { id: NoteId }): Promise<{ deleted: true }>;
    search(input: SearchNotesInput): Promise<{ items: NoteSearchHit[] }>;
    listLinks(input: { noteId: NoteId }): Promise<NoteLinks>;
  };
  ai: {
    createJob(input: CreateJobInput): Promise<AIJobView>;
    getJob(input: { jobId: JobId }): Promise<AIJobView>;
    listJobs(input: { noteId: NoteId }): Promise<{ items: AIJobView[] }>;
    retryJob(input: { jobId: JobId }): Promise<AIJobView>;
    /** Job 상태 변경 푸시. 해제 함수를 반환한다. */
    onJobUpdated(listener: (job: AIJobView) => void): () => void;
  };
  visualization: {
    /** 사용자가 Dialog를 취소하면 { saved: false } */
    savePng(input: { png: Uint8Array; suggestedFileName?: string }): Promise<{ saved: true; filePath: string } | { saved: false }>;
  };
  settings: {
    getProvider(): Promise<ProviderSettingsView>;
    updateProvider(input: UpdateProviderInput): Promise<ProviderSettingsView>;
    testProvider(input: TestProviderInput): Promise<TestProviderResult>;
  };
}

type RawMethod<F> = F extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<IpcResult<R>> : F;

/**
 * Preload가 window.blink로 노출하는 API.
 * contextBridge는 Error의 커스텀 속성(code)을 복사하지 않으므로 Envelope를 그대로 넘기고,
 * Renderer 쪽 클라이언트가 unwrap 한다.
 */
export type RawBlinkApi = { [N in keyof BlinkApi]: { [M in keyof BlinkApi[N]]: RawMethod<BlinkApi[N][M]> } };
