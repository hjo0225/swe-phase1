import { IpcChannels } from '../../../shared/ipc/channels';
import { CreateJobRequest, JobIdRequest, ListJobsRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { AIJobQueries } from '../application/ai-job-queries';
import type { CreateAIJob } from '../application/create-ai-job';
import type { RetryAIJob } from '../application/retry-ai-job';

export function aiIpcHandlers(useCases: { create: CreateAIJob; retry: RetryAIJob; queries: AIJobQueries }): IpcHandlerMap {
  return {
    [IpcChannels.aiCreateJob]: createIpcHandler(CreateJobRequest, (r) => useCases.create.execute(r)),
    [IpcChannels.aiGetJob]: createIpcHandler(JobIdRequest, (r) => useCases.queries.get(r.jobId)),
    [IpcChannels.aiListJobs]: createIpcHandler(ListJobsRequest, (r) => useCases.queries.listByNote(r.noteId)),
    [IpcChannels.aiRetryJob]: createIpcHandler(JobIdRequest, (r) => useCases.retry.execute(r)),
  };
}
