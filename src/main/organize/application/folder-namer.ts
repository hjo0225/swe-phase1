import type { LLMProvider } from '../../ai-provider/application/ports';
import { FolderName } from '../../note/domain/names';
import { DomainError } from '../../platform/errors';

/** 어디에도 안 맞는 노트가 가는 폴더 이름 (층마다 하나) */
export const UNSORTED = '미분류';
export const FOLDER_NAMES_SCHEMA = 'folder_names';

/** 층이 위일수록 보편적으로, 내려갈수록 구체적으로 — «넓게/좁게»라는 말 대신 예시로 넓이를 맞춘다 */
const LEVEL_EXAMPLES = ['공부, 요리, 운동, 업무', '코딩, 영어, 수학', 'Spring, Rust, 파이썬'] as const;

const SYSTEM = [
  '너는 노트 폴더 이름을 짓는다. 노트 제목 묶음마다 폴더 이름을 하나씩 짓는다.',
  '- 이름은 한 단어로 짓는다. 고유명사(Spring, Rust)도 된다. \\ / : * ? " < > | 는 쓰지 않는다.',
  '- «이번에 지을 층»의 예시와 같은 넓이로 짓는다. 위 층일수록 보편적으로, 아래 층일수록 구체적으로.',
  '- «지금 경로» 아래에 들어갈 하위 범주로 짓는다. 지금 경로에 있는 이름은 쓰지 않는다.',
  '- 묶음끼리 이름이 겹치지 않게 한다. «미분류»는 쓰지 않는다.',
  '- names 배열에 묶음 순서대로 이름만 넣는다.',
].join('\n');

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { names: { type: 'array', items: { type: 'string' } } },
  required: ['names'],
  additionalProperties: false,
};

export function folderNamingRequest(input: { parentPath: string; groups: readonly (readonly string[])[] }): {
  system: string;
  user: string;
} {
  const segments = input.parentPath.split('/').filter(Boolean);
  const level = segments.length + 1;
  const deeper = level > LEVEL_EXAMPLES.length ? ` (${LEVEL_EXAMPLES.length}층 예시보다 더 구체적으로)` : '';
  const user = [
    `지금 경로: ${segments.length > 0 ? segments.join(' > ') : '(맨 위)'}`,
    `이번에 지을 층: ${level}층${deeper}`,
    '층별 이름 예시:',
    ...LEVEL_EXAMPLES.map((example, i) => `${i + 1}층: ${example}`),
    '',
    ...input.groups.map((titles, i) => `묶음 ${i + 1}: ${titles.join(' / ')}`),
  ].join('\n');
  return { system: SYSTEM, user };
}

/** 묶음마다 폴더 이름. 쓸 수 없는 답이 오거나 AI 호출이 실패하면 ORGANIZE_NAMING_FAILED. */
export async function nameFolders(
  llm: LLMProvider,
  input: { parentPath: string; groups: readonly (readonly string[])[] },
  signal: AbortSignal,
): Promise<string[]> {
  const { system, user } = folderNamingRequest(input);
  let answer: unknown;
  try {
    answer = await llm.generateStructured({ system, user, schemaName: FOLDER_NAMES_SCHEMA, jsonSchema: SCHEMA, signal });
  } catch {
    // Provider 오류 메시지에는 요청 내용이 섞일 수 있어 그대로 내보내지 않는다.
    throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI could not name the folders');
  }
  const names = parseNames(answer, input.groups.length);
  if (!names) throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI returned unusable folder names');
  return names;
}

function parseNames(answer: unknown, count: number): string[] | null {
  const names = (answer as { names?: unknown } | null)?.names;
  if (!Array.isArray(names) || names.length !== count) return null;
  const result: string[] = [];
  for (const raw of names) {
    if (typeof raw !== 'string') return null;
    let name: string;
    try {
      name = FolderName.of(raw).value; // 파일 이름 규칙 (금지 문자·길이·앞뒤 점)
    } catch {
      return null;
    }
    if (name === UNSORTED || result.some((r) => r.toLowerCase() === name.toLowerCase())) return null;
    result.push(name);
  }
  return result;
}
