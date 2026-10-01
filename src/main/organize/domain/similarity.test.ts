import { describe, expect, it } from 'vitest';
import { cosineSimilarity, distanceToCenter, pairDistance, silhouette, subMatrix } from './similarity';

describe('cosineSimilarity', () => {
  it('is 1 on the diagonal and symmetric', () => {
    const sim = cosineSimilarity([
      [1, 2, 0],
      [0, 1, 3],
      [4, 0, 1],
    ]);
    sim.forEach((row, i) => {
      expect(row[i]).toBeCloseTo(1);
      row.forEach((value, j) => expect(value).toBeCloseTo(sim[j]![i]!));
    });
  });

  it('ignores length: same direction is 1, a right angle is 0', () => {
    const sim = cosineSimilarity([
      [1, 0],
      [5, 0],
      [0, 3],
    ]);
    expect(sim[0]![1]).toBeCloseTo(1);
    expect(sim[0]![2]).toBeCloseTo(0);
  });

  it('treats an all-zero vector as unrelated to everything', () => {
    const sim = cosineSimilarity([
      [0, 0],
      [1, 0],
    ]);
    expect(sim[0]).toEqual([0, 0]);
  });
});

// 1차원 점 0, 1, 5끼리 곱한 표 — 거리를 손으로 확인할 수 있다 (거리² = s(i,i) + s(j,j) − 2·s(i,j))
const line = [0, 1, 5];
const lineSim = line.map((a) => line.map((b) => a * b));

describe('distances', () => {
  it('measures the distance between two entries and to a group center', () => {
    expect(pairDistance(lineSim, 1, 2)).toBeCloseTo(4);
    expect(distanceToCenter(lineSim, 2, [0, 1])).toBeCloseTo(4.5);
  });

  it('cuts a smaller table out of a bigger one', () => {
    expect(subMatrix(lineSim, [2, 1])).toEqual([
      [25, 5],
      [5, 1],
    ]);
  });
});

describe('silhouette', () => {
  it('matches scikit-learn on a small example', () => {
    expect(silhouette(lineSim, [0, 0, 1])).toBeCloseTo(0.5166667, 6);
  });

  it('cannot score when all are together or all are alone', () => {
    expect(() => silhouette(lineSim, [0, 0, 0])).toThrow();
    expect(() => silhouette(lineSim, [0, 1, 2])).toThrow();
  });
});
