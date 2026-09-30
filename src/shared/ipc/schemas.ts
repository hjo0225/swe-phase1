import { z } from 'zod';
import { JOB_TYPES } from '../assist/capabilities';

// 전송 검증은 모양만 본다. 비즈니스 제약(제목 길이, 본문 형식·크기)은 도메인이 검사한다.

export const EmptyRequest = z.object({}).strict();

const NoteIdSchema = z.uuid();
/** root가 `doc`인지는 도메인(NOTE_CONTENT_INVALID)이 판정한다. */
const DocSchema = z.looseObject({ type: z.string() });

export const CreateNoteRequest = z.object({ title: z.string().optional(), content: DocSchema.optional() }).strict();

export const UpdateNoteRequest = z
  .object({ id: NoteIdSchema, title: z.string().optional(), content: DocSchema.optional() })
  .strict()
  .refine((r) => r.title !== undefined || r.content !== undefined, { message: 'title or content is required' });

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
