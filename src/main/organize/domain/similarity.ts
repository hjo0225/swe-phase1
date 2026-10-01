/**
 * 제목끼리의 유사도 표. 제목을 글자 2~4개 조각의 TF-IDF 숫자 목록(길이 1)으로 바꾼 뒤 서로 곱한 값(코사인 유사도).
 * 1이면 같은 제목, 0이면 겹치는 조각이 없다. 거리·대표 위치·k-means가 모두 이 표 하나로 계산된다.
 */
export type Similarity = readonly (readonly number[])[];

export function titleSimilarity(titles: readonly string[]): number[][] {
  const grams = titles.map(charGrams);
  const docFreq = new Map<string, number>();
  for (const list of grams) for (const gram of new Set(list)) docFreq.set(gram, (docFreq.get(gram) ?? 0) + 1);
  const n = titles.length;
  const vectors = grams.map((list) => {
    const counts = new Map<string, number>();
    for (const gram of list) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    // 여러 제목에 흔한 조각은 가볍게, 드문 조각은 무겁게 (scikit-learn smooth idf와 같은 식)
    const weights = new Map<string, number>();
    for (const [gram, count] of counts) weights.set(gram, count * (Math.log((1 + n) / (1 + docFreq.get(gram)!)) + 1));
    const length = Math.sqrt([...weights.values()].reduce((sum, w) => sum + w * w, 0));
    for (const [gram, w] of weights) weights.set(gram, length === 0 ? 0 : w / length);
    return weights;
  });
  return vectors.map((a) =>
    vectors.map((b) => {
      let dot = 0;
      for (const [gram, w] of a) dot += w * (b.get(gram) ?? 0);
      return dot;
    }),
  );
}

/** 단어마다 앞뒤에 공백을 붙여 2~4글자 조각을 낸다 (scikit-learn char_wb와 같은 방식). */
function charGrams(title: string): string[] {
  const grams: string[] = [];
  for (const word of title.toLowerCase().split(/[\s\-_.,()[\]]+/).filter(Boolean)) {
    const padded = ` ${word} `;
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i + size <= padded.length; i += 1) grams.push(padded.slice(i, i + size));
    }
  }
  return grams;
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
