import type { JobType } from '../../../shared/assist/capabilities';

export interface Source {
  title: string;
  url: string;
}

/** 유형별로 검증된 결과. 생성 팩토리(JobResults)만 이 값을 만든다 (BR-ASSIST-03·04). */
export type JobResult =
  | { kind: 'MARKDOWN'; markdown: string }
  /** markdown은 출처 목록이 붙은 적용용 최종본 */
  | { kind: 'RESEARCHED_MARKDOWN'; markdown: string; sources: Source[] }
  | { kind: 'INFOGRAPHIC'; spec: unknown };

export type MarkdownResult = Extract<JobResult, { kind: 'MARKDOWN' }>;
export type ResearchedResult = Extract<JobResult, { kind: 'RESEARCHED_MARKDOWN' }>;
export type InfographicResult = Extract<JobResult, { kind: 'INFOGRAPHIC' }>;

export const RESULT_KIND_OF: Record<JobType, JobResult['kind']> = {
  ORGANIZE: 'MARKDOWN',
  EXPAND: 'RESEARCHED_MARKDOWN',
  VISUALIZE: 'INFOGRAPHIC',
};

/** 결과가 규칙을 만족하지 않을 때. Runner가 JobFailure로 바꾼다. */
export class JobOutputError extends Error {
  constructor(
    readonly code: 'INVALID_OUTPUT' | 'NO_SOURCES',
    message: string,
  ) {
    super(message);
    this.name = 'JobOutputError';
  }
}

const MAX_MARKDOWN_LENGTH = 20_000;
const MAX_SOURCES = 5;
const FENCE = /^\s*```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```\s*$/;

export const JobResults = {
  markdown(raw: string): MarkdownResult {
    const markdown = (raw.match(FENCE)?.[1] ?? raw).trim();
    if (markdown.length === 0) throw new JobOutputError('INVALID_OUTPUT', 'Result is empty');
    if (markdown.length > MAX_MARKDOWN_LENGTH) throw new JobOutputError('INVALID_OUTPUT', 'Result is too long');
    return { kind: 'MARKDOWN', markdown };
  },

  researched(raw: string, rawSources: readonly Source[]): ResearchedResult {
    const body = JobResults.markdown(raw).markdown;
    const sources: Source[] = [];
    for (const source of rawSources) {
      if (!isHttpUrl(source.url) || sources.some((s) => s.url === source.url)) continue;
      sources.push({ title: source.title.trim() || source.url, url: source.url });
      if (sources.length === MAX_SOURCES) break;
    }
    if (sources.length === 0) throw new JobOutputError('NO_SOURCES', 'No usable web sources');
    const list = sources.map((s) => `- [${s.title.replace(/[[\]]/g, '')}](${s.url})`).join('\n');
    return { kind: 'RESEARCHED_MARKDOWN', markdown: `${body}\n\n**Sources**\n${list}`, sources };
  },

  /** spec은 visualization 도메인에서 이미 검증된 값이어야 한다. */
  infographic(spec: unknown): InfographicResult {
    return { kind: 'INFOGRAPHIC', spec };
  },
};

function isHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
