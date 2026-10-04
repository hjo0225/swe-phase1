import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../ai-provider/application/ports';
import { fakeProvider } from '../../ai-provider/testing';
import { collapseLoneFolders, folderPlanRequest, planFolders } from './folder-planner';

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
    ['the unsorted folder name', { assignments: [{ group: 'G1', path: ['Unsorted'] }, { group: 'G2', path: ['B'] }] }],
    ['the earlier unsorted folder name', { assignments: [{ group: 'G1', path: ['미분류'] }, { group: 'G2', path: ['B'] }] }],
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

describe('collapseLoneFolders', () => {
  it('drops folders that would only hold one other folder, at the top and further down', () => {
    // 데모에서 실제로 나온 답: 모든 묶음이 Work > Coding 아래 — Work는 Coding 하나만 담는다. 맨 위 넓은 분류(Coding)는 남긴다
    expect(
      collapseLoneFolders([
        ['Work', 'Coding', 'Containers'],
        ['Work', 'Coding', 'Kubernetes'],
        ['Work', 'Coding', 'Process'],
      ]),
    ).toEqual([['Coding', 'Containers'], ['Coding', 'Kubernetes'], ['Coding', 'Process']]);
    expect(
      collapseLoneFolders([
        ['Study', 'Rust', 'Ownership'],
        ['Study', 'Rust', 'Traits'],
        ['Cooking', 'Korean'],
        ['Cooking', 'Baking'],
      ]),
    ).toEqual([['Rust', 'Ownership'], ['Rust', 'Traits'], ['Cooking', 'Korean'], ['Cooking', 'Baking']]);
  });

  it('keeps a folder that holds notes of its own or several folders', () => {
    const paths = [['Study', 'Rust'], ['Study'], ['Cooking']];
    expect(collapseLoneFolders(paths)).toEqual(paths);
    expect(collapseLoneFolders([['Spring', 'JPA'], ['Spring', 'Security'], ['Rust']])).toEqual([['Spring', 'JPA'], ['Spring', 'Security'], ['Rust']]);
  });

  it('keeps one folder when everything goes into a single path', () => {
    expect(collapseLoneFolders([['Work', 'Coding'], ['Work', 'Coding']])).toEqual([['Coding'], ['Coding']]);
  });
});
