import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { useEffect, useRef } from 'react';
import type { AIJobView } from '../../../../shared/ipc/assist';
import { getBlink } from '../../../shared/api/blink';
import { toast } from '../../../shared/ui/toast';
import { upsertJob, useNoteJobs } from '../api/job-queries';
import { applyCommit, planCommit } from '../commit/plan-commit';
import { findPendingRanges, removePending, setJobStatuses } from '../editor/ai-pending';
import { describeRequestError, JOB_FAILURE_MESSAGE } from '../model/messages';
import { requestingJobs } from '../model/request-job';

/**
 * Job 상태와 편집기 문서를 잇는다 (docs/frontend/component-tree.md AssistBridge).
 * - 상태를 편집기에 알린다 → 잠금·Pulse·실패 표시
 * - 문서의 Pending Mark마다 Commit 계획을 세워 적용한다 — 노트를 다시 열었을 때의 복원도 같은 경로다.
 */
export function useAssistBridge(noteId: string, editor: Editor | null): void {
  const { data: jobs } = useNoteJobs(noteId);
  const queryClient = useQueryClient();
  const jobsRef = useRef<Map<string, AIJobView>>(new Map());
  jobsRef.current = new Map((jobs ?? []).map((j) => [j.id, j]));

  // 실패 칩의 문구와 버튼 동작
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.aiPending;
    storage.failureLabel = (jobId) => {
      const code = jobsRef.current.get(jobId)?.failure?.code;
      return code ? JOB_FAILURE_MESSAGE[code] : 'AI 작업에 실패했습니다';
    };
    storage.onDismiss = (jobId) => removePending(editor, jobId);
    storage.onRetry = (jobId) => {
      const job = jobsRef.current.get(jobId);
      const range = findPendingRanges(editor.state.doc).get(jobId);
      if (!job || !range) return;
      if (range.text !== job.inputText) {
        removePending(editor, jobId);
        toast.show('원문이 바뀌어 다시 시도할 수 없습니다');
        return;
      }
      getBlink()
        .ai.retryJob({ jobId })
        .then((next) => upsertJob(queryClient, next))
        .catch((error: unknown) => toast.show(describeRequestError(error)));
    };
    return () => {
      storage.failureLabel = null;
      storage.onDismiss = null;
      storage.onRetry = null;
    };
  }, [editor, queryClient]);

  useEffect(() => {
    if (!editor || !jobs) return;
    setJobStatuses(editor, new Map(jobs.map((j) => [j.id, j.status])));

    for (const jobId of findPendingRanges(editor.state.doc).keys()) {
      const plan = planCommit(editor.state.doc, jobId, jobsRef.current.get(jobId), requestingJobs);
      if (plan.kind === 'replace' || plan.kind === 'insertBelow' || plan.kind === 'discard') {
        applyCommit(editor, plan);
        if (plan.kind === 'discard' && plan.reason === 'changed') toast.show('원문이 바뀌어 AI 결과를 적용하지 않았습니다');
      }
    }
  }, [editor, jobs]);
}
