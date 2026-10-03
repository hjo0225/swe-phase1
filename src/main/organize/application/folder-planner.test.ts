import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../ai-provider/application/ports';
import { fakeProvider } from '../../ai-provider/testing';
import { folderPlanRequest, planFolders } from './folder-planner';

const signal = new AbortController().signal;
const GROUPS = [['spring boot 실무 1편', 'spring 시큐리티 기초'], ['rust 소유권 정리']];

describe('folderPlanRequest', () => {
  it('gives the current path, the starting level, the per-level examples and every group', () => {
    const { user } = folderPlanRequest({ parentPath: '공부', groups: GROUPS });
    expect(user).toContain('지금 경로: 공부');
    expect(user).toContain('경로의 첫 칸은 2층 넓이');
    expect(user).toContain('1층: 공부, 요리, 운동, 업무, 생활');
    expect(user).toContain('G1 (노트 2개): spring boot 실무 1편 / spring 시큐리티 기초');
    expect(user).toContain('G2 (노트 1개): rust 소유권 정리');
  });

  it('gives English examples and asks for English folder names when the titles are English', () => {
    const { user } = folderPlanRequest({ parentPath: '', groups: [['Rust ownership', 'Rust traits'], ['Banana bread']] });
    expect(user).toContain('1층: Study, Cooking, Exercise, Work, Life');
    expect(user).toContain('Folder names must be in English');
    expect(user).not.toContain('공부, 요리');
  });

  it('keeps Korean examples when most titles are Korean', () => {
    const { user } = folderPlanRequest({ parentPath: '', groups: GROUPS });
    expect(user).toContain('폴더 이름은 한국어로 짓는다');
    expect(user).not.toContain('Folder names must be in English');
  });

  it('marks the top level and levels deeper than the examples', () => {
    expect(folderPlanRequest({ parentPath: '', groups: GROUPS }).user).toContain('지금 경로: (맨 위)');
    expect(folderPlanRequest({ parentPath: 'a/b/c', groups: GROUPS }).user).toContain('4층 넓이 (3층 예시보다 더 구체적으로)');
  });
});

describe('planFolders', () => {
  const run = (answer: unknown) =>
    planFolders(fakeProvider({ generateStructured: async () => answer }), { parentPath: '', groups: GROUPS }, signal);

  it('returns a path per group in group order', async () => {
    const answer = {
      assignments: [
        { group: 'G2', path: ['공부', ' Rust '] },
        { group: 'G1', path: ['공부', 'Spring'] },
      ],
    };
    await expect(run(answer)).resolves.toEqual([
      ['공부', 'Spring'],
      ['공부', 'Rust'],
    ]);
  });

  it('asks for the folder_paths JSON schema', async () => {
    const generateStructured = vi.fn(async () => ({ assignments: [{ group: 'G1', path: ['A'] }, { group: 'G2', path: ['B'] }] }));
    await planFolders(fakeProvider({ generateStructured }), { parentPath: '', groups: GROUPS }, signal);
    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ schemaName: 'folder_paths' }));
  });

  it.each([
    ['a missing group', { assignments: [{ group: 'G1', path: ['A'] }] }],
    ['a duplicated group', { assignments: [{ group: 'G1', path: ['A'] }, { group: 'G1', path: ['B'] }, { group: 'G2', path: ['C'] }] }],
    ['an unknown group', { assignments: [{ group: 'G1', path: ['A'] }, { group: 'G2', path: ['B'] }, { group: 'G9', path: ['C'] }] }],
    ['a path deeper than 3', { assignments: [{ group: 'G1', path: ['a', 'b', 'c', 'd'] }, { group: 'G2', path: ['B'] }] }],
    ['an empty path', { assignments: [{ group: 'G1', path: [] }, { group: 'G2', path: ['B'] }] }],
    ['a forbidden character', { assignments: [{ group: 'G1', path: ['A/B'] }, { group: 'G2', path: ['B'] }] }],
    ['the unsorted folder name', { assignments: [{ group: 'G1', path: ['미분류'] }, { group: 'G2', path: ['B'] }] }],
    ['something that is not an object', 'Spring'],
  ])('rejects %s', async (_case, answer) => {
    await expect(run(answer)).rejects.toMatchObject({ code: 'ORGANIZE_NAMING_FAILED' });
  });

  it('turns provider failures into ORGANIZE_NAMING_FAILED', async () => {
    const llm = fakeProvider({
      generateStructured: async () => {
        throw new ProviderError('RATE_LIMIT', 'rate limited');
      },
    });
    await expect(planFolders(llm, { parentPath: '', groups: GROUPS }, signal)).rejects.toMatchObject({
      code: 'ORGANIZE_NAMING_FAILED',
    });
  });
});
