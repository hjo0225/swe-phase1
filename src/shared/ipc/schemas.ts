import { z } from 'zod';
import { JOB_TYPES } from '../assist/capabilities';

// 전송 검증은 모양만 본다. 비즈니스 제약(제목 길이, 본문 형식·크기)은 도메인이 검사한다.

export const EmptyRequest = z.object({}).strict();

const NoteIdSchema = z.uuid();
/** 보관함 기준 경로. 이름 규칙(금지 문자·숨김)은 도메인(FolderPath·NoteName)이 검사한다. */
const RelativePathSchema = z.string().max(1000);

export const VaultOpenRequest = z.object({ root: z.string().min(1).max(1000) }).strict();

export const CreateNoteRequest = z.object({ folder: RelativePathSchema.optional() }).strict();

// 본문 크기(2MB)는 도메인(NOTE_CONTENT_TOO_LARGE)이 판정한다. 여기서는 비정상적인 크기만 막는다.
export const UpdateNoteRequest = z.object({ id: NoteIdSchema, content: z.string().max(10_000_000) }).strict();

export const RenameNoteRequest = z.object({ id: NoteIdSchema, title: z.string().max(1000) }).strict();

export const MoveNoteRequest = z.object({ id: NoteIdSchema, folder: RelativePathSchema }).strict();

export const CreateFolderRequest = z.object({ parent: RelativePathSchema.optional(), name: z.string().max(1000) }).strict();

export const RenameFolderRequest = z.object({ path: RelativePathSchema, name: z.string().max(1000) }).strict();

export const FolderPathRequest = z.object({ path: RelativePathSchema }).strict();

export const NoteIdRequest = z.object({ id: NoteIdSchema }).strict();

export const SearchNotesRequest = z
  .object({
    query: z.string().max(1000),
    excludeNoteId: NoteIdSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const NoteLinksRequest = z.object({ noteId: NoteIdSchema }).strict();

const ProviderIdSchema = z.enum(['openai', 'kimi']);
const ApiKeySchema = z.string().min(1).max(500);

export const UpdateProviderRequest = z
  .object({
    provider: ProviderIdSchema,
    model: z.string().min(1).max(100),
    apiKey: ApiKeySchema.optional(),
    baseUrl: z.string().max(500).nullable().optional(),
  })
  .strict();

export const TestProviderRequest = z
  .object({
    provider: ProviderIdSchema,
    model: z.string().min(1).max(100),
    apiKey: ApiKeySchema.optional(),
    baseUrl: z.string().max(500).optional(),
  })
  .strict();

export const CreateJobRequest = z
  .object({
    jobId: z.uuid(),
    noteId: NoteIdSchema,
    type: z.enum(JOB_TYPES),
    // 길이 규칙(1~10,000자)은 도메인이 AI_INPUT_* 코드로 검사한다. 여기서는 비정상적인 크기만 막는다.
    inputText: z.string().max(100_000),
  })
  .strict();

export const JobIdRequest = z.object({ jobId: z.uuid() }).strict();

export const ListJobsRequest = z.object({ noteId: NoteIdSchema }).strict();

export const SavePngRequest = z
  .object({
    png: z.instanceof(Uint8Array),
    suggestedFileName: z.string().max(200).optional(),
  })
  .strict();
