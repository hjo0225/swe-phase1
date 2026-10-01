/**
 * 제목끼리의 유사도 표. 제목의 임베딩(뜻이 담긴 숫자 목록)끼리 코사인 유사도를 잰 값.
 * 1이면 같은 뜻, 0이면 관계없음. 거리·대표 위치·k-means가 모두 이 표 하나로 계산된다.
 */
export type Similarity = readonly (readonly number[])[];

/** 숫자 목록끼리의 코사인 유사도 표 (길이는 무시하고 방향만 본다). 길이 0인 목록은 모두와 0. */
export function cosineSimilarity(vectors: readonly (readonly number[])[]): number[][] {
  const unit = vectors.map((v) => {
    const length = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    return v.map((x) => (length === 0 ? 0 : x / length));
  });
  const n = unit.length;
  const sim = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      const a = unit[i]!;
      const b = unit[j]!;
      let dot = 0;
      for (let d = 0; d < a.length; d += 1) dot += a[d]! * (b[d] ?? 0);
      sim[i]![j] = dot;
      sim[j]![i] = dot; // 대칭이라 절반만 계산한다
    }
  }
  return sim;
}

const sqrt0 = (x: number) => Math.sqrt(Math.max(0, x));
const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** 두 제목 사이 거리 */
export function pairDistance(sim: Similarity, i: number, j: number): number {
  return sqrt0(sim[i]![i]! + sim[j]![j]! - 2 * sim[i]![j]!);
}

/** 제목 i와 묶음(members)의 대표 위치(평균) 사이 거리. |x − 평균|² = s(x,x) − 2·평균 s(x,j) + 평균 s(j,l) */
export function distanceToCenter(sim: Similarity, i: number, members: readonly number[]): number {
  const toMembers = mean(members.map((j) => sim[i]![j]!));
  const within = mean(members.flatMap((j) => members.map((l) => sim[j]![l]!)));
  return sqrt0(sim[i]![i]! - 2 * toMembers + within);
}

/** 평균 실루엣 점수 (Rousseeuw 1987). 혼자인 묶음의 노트는 0. 묶음 수가 2 ~ 노트 수−1이 아니면 계산할 수 없다. */
export function silhouette(sim: Similarity, labels: readonly number[]): number {
  const n = labels.length;
  const groups = [...new Set(labels)];
  if (groups.length < 2 || groups.length > n - 1) throw new Error(`silhouette needs 2..${n - 1} groups, got ${groups.length}`);
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const meanTo = (group: number) => {
      const others = labels.flatMap((label, j) => (j !== i && label === group ? [pairDistance(sim, i, j)] : []));
      return others.length === 0 ? null : mean(others);
    };
    const a = meanTo(labels[i]!);
    if (a === null) continue;
    const b = Math.min(...groups.filter((g) => g !== labels[i]).map((g) => meanTo(g) ?? Infinity));
    total += (b - a) / Math.max(a, b);
  }
  return total / n;
}

/** 큰 표에서 일부 제목만 골라 작은 표를 만든다 */
export function subMatrix(sim: Similarity, indexes: readonly number[]): number[][] {
  return indexes.map((i) => indexes.map((j) => sim[i]![j]!));
}
