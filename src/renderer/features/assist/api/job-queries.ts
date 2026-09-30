import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { AIJobView, JobStatus } from '../../../../shared/ipc/assist';
import { getBlink } from '../../../shared/api/blink';

export const jobKeys = {
  ofNote: (noteId: string) => ['ai', 'jobs', noteId] as const,
};

/** 노트를 열 때 Pending Mark를 해석하기 위한 이 노트의 Job들 (UC-ASSIST-005). 이후는 이벤트로 갱신한다. */
export function useNoteJobs(noteId: string) {
  return useQuery({
    queryKey: jobKeys.ofNote(noteId),
    queryFn: async () => (await getBlink().ai.listJobs({ noteId })).items,
  });
}

const RANK: Record<JobStatus, number> = { QUEUED: 0, RUNNING: 1, COMPLETED: 2, FAILED: 2 };

/**
 * IPC 응답과 푸시 이벤트는 순서가 뒤바뀌어 올 수 있다(RUNNING 이벤트가 create-job 응답(QUEUED)보다 먼저).
 * 더 오래된 상태로 덮어쓰지 않는다. 재시도는 attempt가 늘어나므로 새 상태로 인정된다.
 */
export function isNewerJob(next: AIJobView, previous: AIJobView): boolean {
  if (next.attempt !== previous.attempt) return next.attempt > previous.attempt;
  return RANK[next.status] >= RANK[previous.status];
}

export function upsertJob(queryClient: QueryClient, job: AIJobView): void {
  const key = jobKeys.ofNote(job.noteId);
  // 열려 있지 않은 노트의 목록은 만들지 않는다 — 열 때 새로 가져온다.
  if (queryClient.getQueryData(key) === undefined) return;
  queryClient.setQueryData<AIJobView[]>(key, (jobs = []) => {
    const previous = jobs.find((j) => j.id === job.id);
    if (previous && !isNewerJob(job, previous)) return jobs;
    return [job, ...jobs.filter((j) => j.id !== job.id)];
  });
}

/** ai:job-updated 구독. 앱 전체에서 하나(AppShell). */
export function useJobEvents(): void {
  const queryClient = useQueryClient();
  useEffect(() => getBlink().ai.onJobUpdated((job) => upsertJob(queryClient, job)), [queryClient]);
}
