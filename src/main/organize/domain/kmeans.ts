import type { Similarity } from './similarity';

/** 같은 seed면 같은 수열 (mulberry32) — 같은 노트면 매번 같은 결과가 나오게 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * k-means (Lloyd + k-means++ 시작점). 숫자 목록 대신 유사도 표로 거리를 계산한다 —
 * 결과는 보통의 k-means와 같고, 계산량이 제목 숫자 목록의 길이와 상관없이 노트 수에만 비례한다.
 * 시작점 운에 따라 결과가 달라지므로 seed를 바꿔 여러 번 돌려 가장 잘 묶인 것을 쓴다.
 */
export function kmeans(sim: Similarity, k: number, seed = 42, restarts = 5): number[] {
  let best: { labels: number[]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r += 1) {
    const labels = kmeansOnce(sim, k, seed + r);
    const value = inertia(sim, labels);
    if (!best || value < best.inertia - 1e-12) best = { labels, inertia: value };
  }
  return best!.labels;
}

/** 묶음 안 흩어진 정도의 합 — 작을수록 잘 묶였다 */
export function inertia(sim: Similarity, labels: readonly number[]): number {
  let total = 0;
  for (const label of new Set(labels)) {
    const g = labels.flatMap((l, i) => (l === label ? [i] : []));
    const self = g.reduce((s, i) => s + sim[i]![i]!, 0);
    const pairs = g.reduce((s, i) => s + g.reduce((t, j) => t + sim[i]![j]!, 0), 0);
    total += self - pairs / g.length;
  }
  return total;
}

function kmeansOnce(sim: Similarity, k: number, seed: number, maxIterations = 100): number[] {
  const n = sim.length;
  const rand = random(seed);
  const d2 = (i: number, j: number) => Math.max(0, sim[i]![i]! + sim[j]![j]! - 2 * sim[i]![j]!);

  // k-means++: 이미 고른 시작점에서 멀수록 뽑힐 확률이 높다
  const starts = [Math.floor(rand() * n)];
  while (starts.length < k) {
    const weights = Array.from({ length: n }, (_, i) => Math.min(...starts.map((s) => d2(i, s))));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total === 0) break; // 남은 제목이 전부 시작점과 같다
    let pick = rand() * total;
    let next = 0;
    while (next < n - 1 && pick >= weights[next]!) pick -= weights[next++]!;
    starts.push(next);
  }
  let labels = assign(starts.map((s) => [s]));
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const groups = Array.from({ length: starts.length }, () => [] as number[]);
    labels.forEach((label, i) => groups[label]!.push(i));
    const next = assign(groups);
    if (next.every((label, i) => label === labels[i])) break;
    labels = next;
  }
  return labels;

  /** 각 제목을 대표 위치가 가장 가까운 묶음에 넣는다. |x − 평균|² = s(x,x) − 2·평균 s(x,j) + 평균 s(j,l) */
  function assign(groups: number[][]): number[] {
    const within = groups.map((g) =>
      g.length === 0 ? 0 : g.reduce((s, j) => s + g.reduce((t, l) => t + sim[j]![l]!, 0), 0) / g.length ** 2,
    );
    return Array.from({ length: n }, (_, i) => {
      let best = 0;
      let bestDistance = Infinity;
      groups.forEach((g, index) => {
        if (g.length === 0) return;
        const d = sim[i]![i]! - (2 * g.reduce((s, j) => s + sim[i]![j]!, 0)) / g.length + within[index]!;
        if (d < bestDistance) {
          best = index;
          bestDistance = d;
        }
      });
      return best;
    });
  }
}
