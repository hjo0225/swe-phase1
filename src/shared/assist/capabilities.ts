/** Main(규칙 강제)과 Renderer(버튼 잠금)가 함께 쓰는 Job 유형별 필요 Capability 표 (D-13, BR-ASSIST-02). */

export type Capability = 'generate' | 'structuredOutput' | 'webSearch';
export type Capabilities = Record<Capability, boolean>;
export type JobType = 'EXPAND' | 'ORGANIZE' | 'VISUALIZE';

export const JOB_TYPES: readonly JobType[] = ['EXPAND', 'ORGANIZE', 'VISUALIZE'];

export const JOB_CAPABILITY_REQUIREMENTS: Record<JobType, readonly Capability[]> = {
  ORGANIZE: ['generate'],
  EXPAND: ['generate', 'webSearch'],
  VISUALIZE: ['generate', 'structuredOutput'],
};

export function missingCapabilities(type: JobType, capabilities: Capabilities): Capability[] {
  return JOB_CAPABILITY_REQUIREMENTS[type].filter((c) => !capabilities[c]);
}

/** BR-ASSIST-01 */
export const MAX_INPUT_LENGTH = 10_000;
