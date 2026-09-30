import { z } from 'zod';

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
