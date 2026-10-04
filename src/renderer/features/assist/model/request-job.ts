import type { QueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { MAX_INPUT_LENGTH, type JobType } from '../../../../shared/assist/capabilities';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { getBlink } from '../../../shared/api/blink';
import { toast } from '../../../shared/ui/toast';
import { upsertJob } from '../api/job-queries';
import { findPendingRanges, markPending, removePending } from '../editor/ai-pending';
import { selectionText } from '../editor/selection-text';
import { describeRequestError } from './messages';

/** ai:create-job 응답을 기다리는 jobId. 이 동안에는 Job 목록에 없어도 Mark를 지우지 않는다. */
export const requestingJobs = new Set<string>();

/**
 * UC-ASSIST-001 (Renderer 쪽).
 * Mark를 요청 **전에** 걸어 스냅샷과 잠금 범위 사이에 편집이 끼어들 틈을 없앤다(D-10).
 */
export async function requestJob(
  editor: Editor,
  request: { noteId: string; type: JobType },
  deps: { queryClient: QueryClient; openSettings(): void },
): Promise<void> {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  // 여러 블록이면 제목·목록 구조를 남긴 글 — AI가 정리된 Components의 중첩(그룹)을 볼 수 있다
  const selected = selectionText(editor.state.doc, from, to);
  if (!selected.trim()) return toast.show('The selection is empty');
  if (selected.length > MAX_INPUT_LENGTH) return toast.show('Select 10,000 characters or fewer');

  const jobId = crypto.randomUUID();
  requestingJobs.add(jobId);
  markPending(editor, jobId, { from, to });
  // Commit 때 비교하는 방식과 똑같이 Mark 범위에서 읽는다 (BR-ASSIST-08).
  const inputText = findPendingRanges(editor.state.doc).get(jobId)?.text ?? selected;

  try {
    const job = await getBlink().ai.createJob({ jobId, noteId: request.noteId, type: request.type, inputText });
    upsertJob(deps.queryClient, job);
  } catch (error) {
    removePending(editor, jobId); // 원문 그대로
    const needsSettings = error instanceof BlinkIpcError && error.code === 'AI_PROVIDER_NOT_CONFIGURED';
    toast.show(describeRequestError(error), needsSettings ? { label: 'Open AI settings', onClick: deps.openSettings } : undefined);
  } finally {
    requestingJobs.delete(jobId);
  }
}
