import { describe, expect, it } from 'vitest';
import { closerNewGroup, fittingFolder, folderRadius } from './placement';
import { titleSimilarity } from './similarity';

/** 1차원 점끼리 곱한 표 — 거리 = 두 점의 차이 */
const line = (xs: number[]) => xs.map((a) => xs.map((b) => a * b));

describe('folderRadius', () => {
  it('measures each note against the center of the others', () => {
    // 폴더 [0, 2]: 0은 나머지(2)와 2, 2는 나머지(0)와 2 → 반경 2
    expect(folderRadius(line([0, 2]), [0, 1])).toBeCloseTo(2);
  });

  it('is 0 for a single note', () => {
    expect(folderRadius(line([3]), [0])).toBe(0);
  });
});

describe('fittingFolder', () => {
  const SPRING = ['spring boot 실무 1편', 'spring boot 실무 2편', 'spring boot 실무 3편'];
  const springFolder = { path: 'Spring', members: [1, 2, 3] };

  it('accepts the next episode of a series', () => {
    const sim = titleSimilarity(['spring boot 실무 4편', ...SPRING]);
    expect(fittingFolder(sim, 0, [springFolder])).toBe('Spring');
  });

  it('rejects an unrelated title', () => {
    const sim = titleSimilarity(['김치찌개 레시피', ...SPRING]);
    expect(fittingFolder(sim, 0, [springFolder])).toBeNull();
  });

  it('picks the closest fitting folder and skips empty ones', () => {
    const folders = [
      { path: 'empty', members: [] },
      { path: 'near', members: [1, 2] },
      { path: 'far', members: [3, 4] },
    ];
    expect(fittingFolder(line([1, 0, 2, 10, 12]), 0, folders)).toBe('near');
  });
});

describe('closerNewGroup', () => {
  // 0번(값 9)은 폴더 {9, 0, 1}에 있지만 새 묶음 {10, 11}의 대표 위치가 더 가깝다
  const sim = line([9, 0, 1, 10, 11]);

  it('returns the new group closer than the note’s own folder center', () => {
    expect(closerNewGroup(sim, 0, [0, 1, 2], [[3, 4]])).toBe(0);
  });

  it('returns null when the own folder is closer', () => {
    expect(closerNewGroup(sim, 1, [0, 1, 2], [[3, 4]])).toBeNull();
  });
});
