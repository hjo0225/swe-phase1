import { describe, expect, it } from 'vitest';
import { bestClustering, MIN_SILHOUETTE } from './clustering';
import { inertia, kmeans } from './kmeans';
import { cosineSimilarity } from './similarity';

/** 가짜 임베딩: 주제 칸(topic)에 1, 제목마다 다른 흔들림 칸(noise)에 0.3 */
const vec = (topic: number, noise: number) => {
  const v = new Array<number>(64).fill(0);
  v[topic] = 1;
  v[16 + noise] = 0.3;
  return v;
};
/** 주제 하나에 제목 count개 */
const topic = (t: number, count: number, from = 0) => Array.from({ length: count }, (_, i) => vec(t, from + i));
const TWO_TOPICS = cosineSimilarity([...topic(0, 3), ...topic(1, 3, 3)]);

describe('kmeans', () => {
  it('gives the same answer for the same seed', () => {
    expect(kmeans(TWO_TOPICS, 2, 7)).toEqual(kmeans(TWO_TOPICS, 2, 7));
  });

  it('splits two clear topics and lowers inertia compared to one group', () => {
    const labels = kmeans(TWO_TOPICS, 2);
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
    expect(inertia(TWO_TOPICS, labels)).toBeLessThan(inertia(TWO_TOPICS, [0, 0, 0, 0, 0, 0]));
  });
});

describe('bestClustering', () => {
  it('finds two groups in two clear topics', () => {
    const result = bestClustering(TWO_TOPICS)!;
    expect(result.k).toBe(2);
    expect(result.labels).toEqual([0, 0, 0, 1, 1, 1]);
    expect(result.score).toBeGreaterThan(MIN_SILHOUETTE);
  });

  it('caps the number of groups at √(n/2) so upper levels stay broad', () => {
    // 8개 = 4주제 × 2개라도 상한이 √(8÷2) = 2라서 2묶음
    const pairs = cosineSimilarity([0, 1, 2, 3].flatMap((t) => topic(t, 2, t * 2)));
    expect(bestClustering(pairs)!.k).toBe(2);
    // 32개 = 4주제 × 8개면 상한이 √(32÷2) = 4라서 4묶음
    const blobs = cosineSimilarity([0, 1, 2, 3].flatMap((t) => topic(t, 8, t * 8)));
    const result = bestClustering(blobs)!;
    expect(result.k).toBe(4);
    expect(new Set(result.labels.slice(0, 8)).size).toBe(1);
  });

  it('returns null with fewer than 3 notes', () => {
    expect(bestClustering(cosineSimilarity(topic(0, 2)))).toBeNull();
  });

  it('returns null when nothing groups clearly', () => {
    // 서로 관계없는 제목 6개: 모두 다른 방향
    const unrelated = cosineSimilarity([0, 1, 2, 3, 4, 5].map((t) => vec(t, t)));
    expect(bestClustering(unrelated)).toBeNull();
  });

  it('does not crash on identical titles', () => {
    const same = vec(0, 0);
    const result = bestClustering(cosineSimilarity([same, same, same, vec(1, 1)]), { minScore: -1 });
    expect(result?.labels).toEqual([0, 0, 0, 1]);
  });
});
