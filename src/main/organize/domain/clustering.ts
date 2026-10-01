import { kmeans } from './kmeans';
import { silhouette, type Similarity } from './similarity';

/** 실루엣은 묶음 수가 2 ~ 노트 수−1일 때만 계산된다 → 노트 3개부터 */
export const MIN_NOTES = 3;
/**
 * 가장 좋은 실루엣도 이보다 낮으면 «나눌 만한 묶음이 없다».
 * 제목 임베딩(text-embedding-3-large)으로 잰 값: 관계없는 제목만 0.023~0.032, 주제가 있는 노트 0.107~0.603.
 */
export const MIN_SILHOUETTE = 0.05;

export interface Clustering {
  /** 노트 순서대로 묶음 번호. 처음 나온 순서대로 0, 1, 2… */
  labels: number[];
  k: number;
  score: number;
}

/**
 * k = 2 ~ max(2, ⌊√(노트 수 ÷ 2)⌋)를 전부 돌려 실루엣이 가장 높은 묶음.
 * 실루엣은 잘게 쪼갤수록 점수가 오르는 경향이 있어서, 상한을 작게 두어야 위층이 넓게 나오고 안에서 다시 누를 때 세세하게 나뉜다.
 */
export function bestClustering(sim: Similarity, options: { minScore?: number; seed?: number } = {}): Clustering | null {
  const n = sim.length;
  if (n < MIN_NOTES) return null;
  const maxK = Math.max(2, Math.floor(Math.sqrt(n / 2)));
  let best: Clustering | null = null;
  for (let k = 2; k <= maxK; k += 1) {
    const raw = kmeans(sim, k, options.seed ?? 42);
    const ids = [...new Set(raw)];
    if (ids.length < 2 || ids.length > n - 1) continue; // 같은 제목이 많으면 k보다 적게 묶일 수 있다
    const labels = raw.map((label) => ids.indexOf(label));
    const score = silhouette(sim, labels);
    if (!best || score > best.score) best = { labels, k, score };
  }
  if (!best || best.score < (options.minScore ?? MIN_SILHOUETTE)) return null;
  return best;
}
