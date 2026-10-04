import type { LLMProvider } from '../../ai-provider/application/ports';
import { FolderName } from '../../note/domain/names';
import { isUnsortedFolder, UNSORTED_FOLDER } from '../../../shared/notes/default-names';
import { DomainError } from '../../platform/errors';

export const FOLDER_PLAN_SCHEMA = 'folder_paths';
/** 분류하기 한 번에 만드는 폴더 깊이 (지금 폴더 기준) */
export const MAX_DEPTH = 3;

/**
 * 층이 위일수록 보편적으로, 내려갈수록 구체적으로 — «넓게/좁게»라는 말 대신 예시로 넓이를 맞춘다.
 * 모델은 지시보다 예시의 언어를 따른다(영어 제목에도 한국어 폴더를 지었다). 그래서 제목의 언어를 코드로 정해
 * 그 언어의 예시만 준다.
 */
const LEVEL_EXAMPLES = {
  ko: ['공부, 요리, 운동, 업무, 생활', '코딩, 영어, 수학', 'Spring, Rust, 파이썬'],
  en: ['Study, Cooking, Exercise, Work, Life', 'Coding, English, Math', 'Spring, Rust, Python'],
} as const;
const LANGUAGE_LINE = {
  ko: '폴더 이름은 한국어로 짓는다 (고유명사는 그대로).',
  en: 'Folder names must be in English (keep proper nouns as they are).',
} as const;

type TitleLanguage = keyof typeof LEVEL_EXAMPLES;

/** 한글이 든 제목이 절반 이상이면 한국어, 아니면 영어 */
export function titleLanguage(groups: readonly (readonly string[])[]): TitleLanguage {
  const titles = groups.flat();
  const korean = titles.filter((title) => /[가-힣]/.test(title)).length;
  return titles.length > 0 && korean * 2 < titles.length ? 'en' : 'ko';
}

const SYSTEM = [
  '너는 노트 폴더 구조를 정한다. 노트 제목을 뜻으로 군집화한 작은 묶음들이 주어진다.',
  `- 묶음마다 들어갈 폴더 경로를 정한다. 경로는 지금 폴더 아래의 폴더 이름을 위층부터 순서대로 적은 배열이고, 길이는 1~${MAX_DEPTH}이다.`,
  '- 위층일수록 보편적으로, 아래층일수록 구체적으로 짓는다. 층별 이름 예시와 같은 넓이로 짓는다.',
  '- 같은 분야의 묶음은 같은 위층 폴더 아래에 모은다. 경로가 완전히 같은 묶음들은 한 폴더로 합쳐진다.',
  '- 하위 폴더를 하나만 갖게 되는 폴더는 만들지 않는다 (그럴 땐 경로를 짧게).',
  '- 지금 경로에 있는 이름은 다시 쓰지 않는다.',
  `- 폴더 이름은 한 단어(고유명사 가능). \\ / : * ? " < > | 는 쓰지 않는다. «${UNSORTED_FOLDER}»·«미분류»는 쓰지 않는다.`,
  '- 모든 묶음을 정확히 한 번씩 assignments에 넣는다.',
].join('\n');

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { group: { type: 'string' }, path: { type: 'array', items: { type: 'string' } } },
        required: ['group', 'path'],
        additionalProperties: false,
      },
    },
  },
  required: ['assignments'],
  additionalProperties: false,
};

const groupId = (index: number) => `G${index + 1}`;

export function folderPlanRequest(input: { parentPath: string; groups: readonly (readonly string[])[] }): {
  system: string;
  user: string;
} {
  const segments = input.parentPath.split('/').filter(Boolean);
  const level = segments.length + 1;
  const language = titleLanguage(input.groups);
  const examples = LEVEL_EXAMPLES[language];
  const deeper = level > examples.length ? ` (${examples.length}층 예시보다 더 구체적으로)` : '';
  const user = [
    `지금 경로: ${segments.length > 0 ? segments.join(' > ') : '(맨 위)'}`,
    `받는 경로의 첫 칸은 ${level}층 넓이${deeper}`,
    '층별 이름 예시:',
    ...examples.map((example, i) => `${i + 1}층: ${example}`),
    LANGUAGE_LINE[language],
    '',
    '묶음:',
    ...input.groups.map((titles, i) => `${groupId(i)} (노트 ${titles.length}개): ${titles.join(' / ')}`),
  ].join('\n');
  return { system: SYSTEM, user };
}

/**
 * 작은 묶음마다 폴더 경로(지금 폴더 기준, 1~3층)를 gpt에게 받는다. 묶음 순서대로 돌려준다.
 * 하위 폴더 하나만 담는 겹은 뺀다 (collapseLoneFolders).
 * 쓸 수 없는 답이 오거나 AI 호출이 실패하면 ORGANIZE_NAMING_FAILED.
 */
export async function planFolders(
  llm: LLMProvider,
  input: { parentPath: string; groups: readonly (readonly string[])[] },
  signal: AbortSignal,
): Promise<string[][]> {
  const { system, user } = folderPlanRequest(input);
  let answer: unknown;
  try {
    answer = await llm.generateStructured({ system, user, schemaName: FOLDER_PLAN_SCHEMA, jsonSchema: SCHEMA, signal });
  } catch {
    // Provider 오류 메시지에는 요청 내용이 섞일 수 있어 그대로 내보내지 않는다.
    throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI could not plan the folders');
  }
  const paths = parsePaths(answer, input.groups.length);
  if (!paths) throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI returned an unusable folder plan');
  return collapseLoneFolders(paths);
}

/**
 * 하위 폴더 하나만 담고 노트는 없을 폴더를 뺀다 — 열어 봐야 폴더 하나만 나오는 겹은 쓸모가 없다
 * (맨 위 한 겹은 넓은 분류라 남긴다 — 예: 공부 > Spring, Rust)
 * (실제 답: 모든 묶음이 "Work > Coding > …" 아래 → Coding > …). 남는 쪽은 더 구체적인 아래 폴더다.
 */
export function collapseLoneFolders(paths: readonly (readonly string[])[]): string[][] {
  let result = paths.map((path) => [...path]);
  const key = (path: readonly string[], length: number) => JSON.stringify(path.slice(0, length));
  for (;;) {
    const lone = findLoneFolder(result, key);
    if (!lone) return result;
    const { prefix, depth } = lone;
    result = result.map((path) => (key(path, depth) === prefix ? [...path.slice(0, depth - 1), ...path.slice(depth)] : path));
  }
}

function findLoneFolder(
  paths: readonly string[][],
  key: (path: readonly string[], length: number) => string,
): { prefix: string; depth: number } | null {
  for (const path of paths) {
    for (let depth = 1; depth < path.length; depth += 1) {
      const prefix = key(path, depth);
      const under = paths.filter((other) => key(other, depth) === prefix && other.length >= depth);
      const holdsNotes = under.some((other) => other.length === depth);
      const children = new Set(under.map((other) => other[depth]));
      if (!holdsNotes && children.size === 1) return { prefix, depth };
    }
  }
  return null;
}

function parsePaths(answer: unknown, count: number): string[][] | null {
  const assignments = (answer as { assignments?: unknown } | null)?.assignments;
  if (!Array.isArray(assignments) || assignments.length !== count) return null;
  const byGroup = new Map<string, string[]>();
  for (const item of assignments) {
    const { group, path } = (item ?? {}) as { group?: unknown; path?: unknown };
    if (typeof group !== 'string' || byGroup.has(group) || !Array.isArray(path)) return null;
    if (path.length < 1 || path.length > MAX_DEPTH) return null;
    const names: string[] = [];
    for (const raw of path) {
      if (typeof raw !== 'string') return null;
      let name: string;
      try {
        name = FolderName.of(raw).value; // 파일 이름 규칙 (금지 문자·길이·앞뒤 점)
      } catch {
        return null;
      }
      if (isUnsortedFolder(name)) return null;
      names.push(name);
    }
    byGroup.set(group, names);
  }
  const paths: string[][] = [];
  for (let i = 0; i < count; i += 1) {
    const path = byGroup.get(groupId(i));
    if (!path) return null; // 모르는 묶음 이름이 있으면 여기서 빠진 묶음이 생긴다
    paths.push(path);
  }
  return paths;
}
