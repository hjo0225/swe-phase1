import { describe, expect, it } from 'vitest';
import { closerNewGroup, fittingFolder, folderRadius } from './placement';
import { cosineSimilarity } from './similarity';

/** 1차원 점끼리 곱한 표 — 거리 = 두 점의 차이 */
const line = (xs: number[]) => xs.map((a) => xs.map((b) => a * b));

/** 가짜 임베딩: 주제 칸(topic)에 1, 제목마다 다른 흔들림 칸(noise)에 0.3 */
const vec = (topic: number, noise: number) => {
  const v = new Array<number>(512).fill(0);
  v[topic] = 1;
  v[8 + noise] = 0.3;
  return v;
};

describe('speed', () => {
  it('measures the radius of a 400-note folder within half a second', () => {
    const sim = cosineSimilarity(Array.from({ length: 400 }, (_, i) => vec(i % 5, i)));
    const start = performance.now();
    folderRadius(
      sim,
      sim.map((_, i) => i),
    );
    expect(performance.now() - start).toBeLessThan(500);
  });
});

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
  const SPRING = [vec(0, 0), vec(0, 1), vec(0, 2)];
  const springFolder = { path: 'Spring', members: [1, 2, 3] };

  it('accepts a new title on the same topic', () => {
    const sim = cosineSimilarity([vec(0, 9), ...SPRING]);
    expect(fittingFolder(sim, 0, [springFolder])).toBe('Spring');
  });

  it('rejects an unrelated title', () => {
    const sim = cosineSimilarity([vec(1, 9), ...SPRING]);
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
