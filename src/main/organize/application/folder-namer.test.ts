import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../ai-provider/application/ports';
import { fakeProvider } from '../../ai-provider/testing';
import { folderNamingRequest, nameFolders } from './folder-namer';

const signal = new AbortController().signal;

describe('folderNamingRequest', () => {
  it('gives the path, the level and the per-level examples', () => {
    const { user } = folderNamingRequest({ parentPath: '공부/코딩', groups: [['spring boot 실무 1편'], ['rust 소유권 정리']] });
    expect(user).toContain('지금 경로: 공부 > 코딩');
    expect(user).toContain('이번에 지을 층: 3층');
    expect(user).toContain('1층: 공부, 요리, 운동, 업무');
    expect(user).toContain('묶음 1: spring boot 실무 1편');
    expect(user).toContain('묶음 2: rust 소유권 정리');
  });

  it('marks the top level and levels deeper than the examples', () => {
    expect(folderNamingRequest({ parentPath: '', groups: [['a']] }).user).toContain('지금 경로: (맨 위)');
    expect(folderNamingRequest({ parentPath: 'a/b/c', groups: [['x']] }).user).toContain('4층 (3층 예시보다 더 구체적으로)');
  });
});

describe('nameFolders', () => {
  const run = (answer: unknown) =>
    nameFolders(fakeProvider({ generateStructured: async () => answer }), { parentPath: '', groups: [['t1'], ['t2']] }, signal);

  it('returns the names in group order', async () => {
    await expect(run({ names: ['Spring', ' Rust '] })).resolves.toEqual(['Spring', 'Rust']);
  });

  it('asks for the folder_names JSON schema', async () => {
    const generateStructured = vi.fn(async () => ({ names: ['A', 'B'] }));
    await nameFolders(fakeProvider({ generateStructured }), { parentPath: '', groups: [['x'], ['y']] }, signal);
    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ schemaName: 'folder_names' }));
  });

  it.each([
    ['a wrong count', { names: ['A'] }],
    ['a forbidden character', { names: ['A/B', 'C'] }],
    ['duplicate names', { names: ['Spring', 'spring'] }],
    ['the unsorted folder name', { names: ['미분류', 'A'] }],
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
    await expect(nameFolders(llm, { parentPath: '', groups: [['a'], ['b']] }, signal)).rejects.toMatchObject({
      code: 'ORGANIZE_NAMING_FAILED',
    });
  });
});
