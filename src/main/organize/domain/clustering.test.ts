import { describe, expect, it } from 'vitest';
import { bestClustering, MIN_SILHOUETTE } from './clustering';
import { inertia, kmeans } from './kmeans';
import { titleSimilarity } from './similarity';

const SPRING = ['spring boot 실무 1편', 'spring boot 실무 2편', 'spring boot 실무 3편'];
const RUST = ['rust 소유권 정리', 'rust 소유권 활용', 'rust 소유권 심화'];

describe('kmeans', () => {
  it('gives the same answer for the same seed', () => {
    const sim = titleSimilarity([...SPRING, ...RUST]);
    expect(kmeans(sim, 2, 7)).toEqual(kmeans(sim, 2, 7));
  });

  it('splits two clear topics and lowers inertia compared to one group', () => {
    const sim = titleSimilarity([...SPRING, ...RUST]);
    const labels = kmeans(sim, 2);
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
    expect(inertia(sim, labels)).toBeLessThan(inertia(sim, [0, 0, 0, 0, 0, 0]));
  });
});

describe('bestClustering', () => {
  it('finds two groups in two clear topics', () => {
    const result = bestClustering(titleSimilarity([...SPRING, ...RUST]))!;
    expect(result.k).toBe(2);
    expect(result.labels).toEqual([0, 0, 0, 1, 1, 1]);
    expect(result.score).toBeGreaterThan(MIN_SILHOUETTE);
  });

  it('tries up to half the notes: 8 titles in 4 pairs become 4 groups', () => {
    const titles = ['김치찌개 레시피', '김치찌개 황금비율', '스쿼트 자세', '스쿼트 루틴', 'rust 소유권', 'rust 소유권 정리', '영어 회화', '영어 회화 표현'];
    const result = bestClustering(titleSimilarity(titles))!;
    expect(result.k).toBe(4);
    expect(result.labels).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('returns null with fewer than 3 notes', () => {
    expect(bestClustering(titleSimilarity(['spring boot 실무 1편', 'spring boot 실무 2편']))).toBeNull();
  });

  it('returns null when nothing groups clearly', () => {
    const titles = ['spring boot 실무 1편', '김치찌개 레시피', '스쿼트 자세', '영어 회화 표현', 'rust 소유권 정리', '자료구조 스택'];
    expect(bestClustering(titleSimilarity(titles))).toBeNull();
  });

  it('does not crash on identical titles', () => {
    const result = bestClustering(titleSimilarity(['회의', '회의', '회의', 'spring 기초']), { minScore: -1 });
    expect(result?.labels).toEqual([0, 0, 0, 1]);
  });
});
