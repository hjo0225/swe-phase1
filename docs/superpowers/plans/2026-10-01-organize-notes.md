# Blink 노트 자동 분류 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blink 보관함의 `.md` 노트를 **제목만 보고** 묶어서 하위 폴더를 만들고(«분류하기»), 새 노트는 처음 제목을 붙일 때 맞는 폴더로 자동으로 옮긴다.

**Architecture:** Main Process에 새 도메인 `src/main/organize/`를 만든다. 계산(제목 유사도 표 · k-means · 실루엣 · 폴더 판정)은 순수 TypeScript `domain/`, 흐름은 `application/OrganizeService`, 노트·폴더 이동은 note 도메인의 기존 공개 기능(`move`, `rename`, `folders.create`)을, 폴더 이름은 ai-provider의 `ActiveLLM`을 쓴다. Renderer에는 미리보기 대화상자, 폴더 메뉴의 «분류하기», 끌어다 놓기 가져오기, 첫 제목 자동 배치를 붙인다.

**Tech Stack:** Electron 44 · React 19 · TypeScript 6 · Zod 4 · Vitest 5 · Testing Library (Blink 그대로). 새 패키지 없음.

**Spec:** `소웨공/Phase1_파일분류_계획서.md` (이하 «계획서»). Blink 저장소: https://github.com/hjo0225/swe-phase1 (`9a08ce3` 기준으로 작성).

## Global Constraints

- 노트 **내용은 보지 않고 제목만** 쓴다. 정리 대상은 `.md` 노트만.
- 묶음 수 k = 2 ~ max(2, ⌊노트 수 ÷ 2⌋) 전부 시험, 실루엣 점수가 가장 높은 k. 노트 3개 미만이면 분류하지 않는다.
- 1개짜리 묶음은 폴더로 만들지 않는다.
- 「미분류」는 층마다 실제 폴더로 만든다. 하위 폴더가 아예 없는 폴더에는 만들지 않는다. 「미분류」 안에서는 분류하지 않는다.
- «분류하기» 한 번 = 한 층. 누른 폴더의 노트 + 그 폴더의 「미분류」 노트가 대상. 먼저 기존 하위 폴더에 맞는 노트를 넣고, 남은 노트만 묶는다. 새 폴더가 생기면 형제 폴더 노트 중 새 폴더에 더 가까운 노트도 자동으로 옮긴다. 옮기기 전에 미리보기.
- 폴더 이름: 분류하기 한 번에 AI 호출 한 번. 층별 예시(1층 «공부, 요리, 운동, 업무» / 2층 «코딩, 영어, 수학» / 3층 «Spring, Rust, 파이썬») + 지금 경로를 주고, JSON(`folder_names`)으로 받는다. AI는 Blink 설정의 «사용 중» 모델(`gpt-5.4-mini`)을 `ActiveLLM`으로 쓴다.
- 새 노트 자동 배치: **처음 제목을 붙일 때 한 번**(또는 바깥 `.md`를 놓는 순간), **만든 폴더(놓은 폴더)부터** 아래로. 그 뒤 제목을 바꿔도 움직이지 않는다.
- 옮기기는 Blink의 `note:move`(링크 자동 수정)·`folder:create`를 쓴다. 옮길 폴더에 같은 제목이 있으면 `제목 (2)`, `제목 (3)`…
- Blink 규칙: domain 코드에서 `electron`·`drizzle-orm`·`better-sqlite3`·`openai`를 import하지 않는다. IPC 입력은 Zod로 검증하고 Result Envelope(`{ ok, data | error }`)로 답한다. 다른 도메인은 application 공개 API나 도메인 값 객체로만 쓴다.
- 확인 명령: `pnpm test` (전체), `pnpm vitest run <파일>` (하나), `pnpm typecheck`.

### 계획서와 달라진 점 (측정 근거 있음 — 사용자 확인 필요)

| 무엇 | 계획서 | 이 구현계획 | 근거 |
|---|---|---|---|
| k-means 도구 | `ml-kmeans` (npm) | 직접 작성 (유사도 표 방식, 결과는 같은 k-means) | `ml-kmeans`로 재 보니 노트 100개 9.5초, 200개 121초. 유사도 표 방식은 100개 0.45초, 200개 5.3초 |
| 폴더 «반경» | 대표 위치에서 가장 먼 기존 노트까지의 거리 | 기존 노트마다 **자기를 뺀 나머지의 대표 위치**까지 거리를 재서 가장 먼 값 | 원래 방식이면 «spring boot 실무 1·2·3편» 폴더가 «4편»을 거절함 (자기가 대표 위치 계산에 들어가 있어 거리가 작게 나옴) |
| 실루엣 기준값 | 0.51 (메모: «직접 정해야 할 듯») | **0.1** | 제목만으로 뚜렷한 두 주제 = 0.45, 네 쌍 = 0.42, 전부 다른 6개 = 0.02. 0.51이면 항상 «나눌 게 없음» |

## Review Focus

1. **같은 제목이 여러 개** (예: 폴더 안과 「미분류」에 같은 «회의») → 멈추거나 오류 없이 한 묶음으로 본다. → Task 2 테스트 `does not crash on identical titles`
2. **미리보기 뒤 옮기기 전에 노트가 지워짐** → 그 노트만 건너뛰고 나머지는 옮긴다. → Task 6 테스트 `creates 미분류 when needed and skips notes deleted after the preview`
3. **옮길 폴더에 같은 제목** → 실패하지 않고 `제목 (2)`로 옮긴다. → Task 6 테스트 `numbers the title when the target folder already has it`
4. **AI가 설정 안 됨 / AI가 이상한 이름을 줌** → «분류하기»만 알림을 띄우고, 자동 배치·가져오기는 AI 없이 된다. → Task 4 테스트 `rejects …`, Task 6 테스트 `needs a configured AI only when new folders must be named`, `works without an AI`
5. **`.md`가 아닌 파일·없는 파일·다른 프로그램이 연 파일을 끌어다 놓음** → 아무것도 옮기지 않고 알린다. → Task 5 테스트 `refuses a … file`, Task 8 테스트 `only accepts .md files when dropping`

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `src/main/organize/domain/similarity.ts` (새) | 제목 → 유사도 표, 거리, 대표 위치까지 거리, 실루엣 |
| `src/main/organize/domain/kmeans.ts` (새) | 유사도 표로 도는 k-means (k-means++ 시작, 5번 다시 시작) |
| `src/main/organize/domain/clustering.ts` (새) | k 범위를 돌며 실루엣이 가장 좋은 묶음 고르기, 기준값 |
| `src/main/organize/domain/placement.ts` (새) | 폴더 반경, 맞는 폴더 찾기, 새 묶음으로 옮길지 판정 |
| `src/main/organize/application/folder-namer.ts` (새) | AI 질문 만들기, 답 검증 |
| `src/main/organize/application/organize-service.ts` (새) | 미리보기·옮기기·자동 배치·가져오기 |
| `src/main/organize/presentation/organize.ipc.ts` (새) | IPC 4개 |
| `src/shared/ipc/organize.ts` (새) | IPC 계약 타입 |
| `src/renderer/features/organize/api/organize-queries.ts` (새) | React Query 훅 |
| `src/renderer/features/organize/components/OrganizeDialog.tsx` (새) | 미리보기 대화상자 |
| `src/shared/ipc/result.ts`, `channels.ts`, `schemas.ts`, `blink-api.ts` | 오류 코드·채널·검증·API 타입 추가 |
| `src/main/note/domain/names.ts`, `node-vault-file-system.ts`, `vault-note-service.ts` | 번호 이름, 바깥 파일 가져오기 |
| `src/main/ai-provider/infrastructure/fake-llm-provider.ts` | 가짜 AI가 폴더 이름도 답하게 |
| `src/main/bootstrap.ts`, `src/preload/raw-api.ts`, `src/preload/index.ts` | 연결 |
| `src/renderer/mocks/createMockBlink.ts` | 화면 테스트용 가짜 구현 |
| `src/renderer/features/notes/api/note-queries.ts`, `components/NoteTree.tsx`, `components/TitleInput.tsx`, `src/renderer/app/Sidebar.tsx` | 화면 연결 |

---

### Task 1: 제목 유사도 표 · 거리 · 실루엣

**Files:**
- Create: `src/main/organize/domain/similarity.ts`
- Test: `src/main/organize/domain/similarity.test.ts`

**Interfaces:**
- Produces:
  - `type Similarity = readonly (readonly number[])[]`
  - `titleSimilarity(titles: readonly string[]): number[][]` — 대각선 1, 대칭
  - `pairDistance(sim: Similarity, i: number, j: number): number`
  - `distanceToCenter(sim: Similarity, i: number, members: readonly number[]): number`
  - `silhouette(sim: Similarity, labels: readonly number[]): number` — 묶음 수가 2 ~ n−1이 아니면 throw
  - `subMatrix(sim: Similarity, indexes: readonly number[]): number[][]`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/organize/domain/similarity.test.ts
import { describe, expect, it } from 'vitest';
import { distanceToCenter, pairDistance, silhouette, subMatrix, titleSimilarity } from './similarity';

describe('titleSimilarity', () => {
  it('is 1 on the diagonal and symmetric', () => {
    const sim = titleSimilarity(['spring boot 실무', 'spring 시큐리티', '김치찌개 레시피']);
    sim.forEach((row, i) => {
      expect(row[i]).toBeCloseTo(1);
      row.forEach((value, j) => expect(value).toBeCloseTo(sim[j]![i]!));
    });
  });

  it('rates titles on the same topic as more similar', () => {
    const sim = titleSimilarity(['spring boot 실무 1편', 'spring boot 실무 2편', '김치찌개 레시피']);
    expect(sim[0]![1]!).toBeGreaterThan(sim[0]![2]!);
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
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/organize/domain/similarity.test.ts`
Expected: FAIL — `Failed to resolve import "./similarity"`

- [ ] **Step 3: 구현**

```ts
// src/main/organize/domain/similarity.ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/main/organize/domain/similarity.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/organize/domain/similarity.ts src/main/organize/domain/similarity.test.ts
git commit -m "feat: add title similarity table, distances and silhouette for organize"
```

---

### Task 2: k-means와 묶음 수 고르기

**Files:**
- Create: `src/main/organize/domain/kmeans.ts`, `src/main/organize/domain/clustering.ts`
- Test: `src/main/organize/domain/clustering.test.ts`

**Interfaces:**
- Consumes: `Similarity`, `silhouette` (Task 1)
- Produces:
  - `kmeans(sim: Similarity, k: number, seed = 42, restarts = 5): number[]`
  - `inertia(sim: Similarity, labels: readonly number[]): number`
  - `MIN_NOTES = 3`, `MIN_SILHOUETTE = 0.1`
  - `interface Clustering { labels: number[]; k: number; score: number }` — labels는 처음 나온 순서대로 0, 1, 2…
  - `bestClustering(sim: Similarity, options?: { minScore?: number; seed?: number }): Clustering | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/organize/domain/clustering.test.ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/organize/domain/clustering.test.ts`
Expected: FAIL — `Failed to resolve import "./clustering"`

- [ ] **Step 3: 구현**

```ts
// src/main/organize/domain/kmeans.ts
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
```

```ts
// src/main/organize/domain/clustering.ts
import { kmeans } from './kmeans';
import { silhouette, type Similarity } from './similarity';

/** 실루엣은 묶음 수가 2 ~ 노트 수−1일 때만 계산된다 → 노트 3개부터 */
export const MIN_NOTES = 3;
/**
 * 가장 좋은 실루엣도 이보다 낮으면 «나눌 만한 묶음이 없다».
 * 제목만으로 잰 값: 뚜렷한 두 주제 0.45, 네 쌍 0.42, 전부 다른 6개 0.02 (계획서 0.51에서 바꿈 — 구현계획서 «계획서와 달라진 점»).
 */
export const MIN_SILHOUETTE = 0.1;

export interface Clustering {
  /** 노트 순서대로 묶음 번호. 처음 나온 순서대로 0, 1, 2… */
  labels: number[];
  k: number;
  score: number;
}

/** k = 2 ~ max(2, ⌊노트 수 ÷ 2⌋)를 전부 돌려 실루엣이 가장 높은 묶음. ÷2보다 크면 1개짜리 묶음이 반드시 생긴다. */
export function bestClustering(sim: Similarity, options: { minScore?: number; seed?: number } = {}): Clustering | null {
  const n = sim.length;
  if (n < MIN_NOTES) return null;
  const maxK = Math.max(2, Math.floor(n / 2));
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
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/main/organize/domain/clustering.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/organize/domain/kmeans.ts src/main/organize/domain/clustering.ts src/main/organize/domain/clustering.test.ts
git commit -m "feat: pick the number of title groups by silhouette over similarity-table k-means"
```

---

### Task 3: 폴더에 맞는지 판정

**Files:**
- Create: `src/main/organize/domain/placement.ts`
- Test: `src/main/organize/domain/placement.test.ts`

**Interfaces:**
- Consumes: `Similarity`, `distanceToCenter` (Task 1)
- Produces:
  - `interface FolderShape { path: string; members: number[] }` — members = 유사도 표의 번호
  - `folderRadius(sim: Similarity, members: readonly number[]): number`
  - `fittingFolder(sim: Similarity, note: number, folders: readonly FolderShape[]): string | null`
  - `closerNewGroup(sim: Similarity, note: number, ownMembers: readonly number[], newGroups: readonly (readonly number[])[]): number | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/organize/domain/placement.test.ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/organize/domain/placement.test.ts`
Expected: FAIL — `Failed to resolve import "./placement"`

- [ ] **Step 3: 구현**

```ts
// src/main/organize/domain/placement.ts
import { distanceToCenter, type Similarity } from './similarity';

export interface FolderShape {
  path: string;
  /** 이 폴더(하위 포함) 노트들의 유사도 표 번호 */
  members: number[];
}

/**
 * 폴더 반경: 기존 노트마다 «자기를 뺀 나머지 노트들의 대표 위치»까지 거리를 재서 가장 먼 값.
 * 자기를 빼는 이유: 자기가 대표 위치 계산에 들어가 있으면 거리가 작게 나와서, 비슷한 제목(«4편»)도 밖으로 밀려난다.
 * 노트가 1개면 비교할 나머지가 없어 반경 0.
 */
export function folderRadius(sim: Similarity, members: readonly number[]): number {
  if (members.length < 2) return 0;
  return Math.max(...members.map((m) => distanceToCenter(sim, m, members.filter((x) => x !== m))));
}

/** 반경 안에 들어오는 폴더 중 대표 위치가 가장 가까운 폴더. 없으면 null. */
export function fittingFolder(sim: Similarity, note: number, folders: readonly FolderShape[]): string | null {
  let best: { path: string; distance: number } | null = null;
  for (const folder of folders) {
    if (folder.members.length === 0) continue;
    const d = distanceToCenter(sim, note, folder.members);
    if (d <= folderRadius(sim, folder.members) && (!best || d < best.distance)) best = { path: folder.path, distance: d };
  }
  return best?.path ?? null;
}

/** 자기 폴더 대표 위치보다 더 가까운 새 묶음이 있으면 그 번호 (가장 가까운 것). 없으면 null. */
export function closerNewGroup(
  sim: Similarity,
  note: number,
  ownMembers: readonly number[],
  newGroups: readonly (readonly number[])[],
): number | null {
  let best: number | null = null;
  let bestDistance = distanceToCenter(sim, note, ownMembers);
  newGroups.forEach((group, i) => {
    const d = distanceToCenter(sim, note, group);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/main/organize/domain/placement.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/organize/domain/placement.ts src/main/organize/domain/placement.test.ts
git commit -m "feat: decide which folder a title fits with a leave-one-out radius"
```

---

### Task 4: AI로 폴더 이름 짓기

**Files:**
- Create: `src/main/organize/application/folder-namer.ts`
- Modify: `src/shared/ipc/result.ts:30-31`, `src/main/ai-provider/infrastructure/fake-llm-provider.ts:45-62`
- Test: `src/main/organize/application/folder-namer.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `ProviderError` (`src/main/ai-provider/application/ports.ts`), `FolderName` (`src/main/note/domain/names.ts`), `DomainError`
- Produces:
  - `UNSORTED = '미분류'`, `FOLDER_NAMES_SCHEMA = 'folder_names'`
  - `folderNamingRequest(input: { parentPath: string; groups: readonly (readonly string[])[] }): { system: string; user: string }`
  - `nameFolders(llm: LLMProvider, input: { parentPath: string; groups: readonly (readonly string[])[] }, signal: AbortSignal): Promise<string[]>` — 실패하면 `DomainError('ORGANIZE_NAMING_FAILED')`
  - 오류 코드 `ORGANIZE_NAMING_FAILED`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/organize/application/folder-namer.test.ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/organize/application/folder-namer.test.ts`
Expected: FAIL — `Failed to resolve import "./folder-namer"`

- [ ] **Step 3: 오류 코드 추가** — `src/shared/ipc/result.ts`의 `ExportErrorCode` 줄 아래와 `BlinkErrorCode`를 이렇게 바꾼다

```ts
export type ExportErrorCode = 'EXPORT_INVALID_IMAGE' | 'EXPORT_TOO_LARGE' | 'EXPORT_WRITE_FAILED';
export type OrganizeErrorCode = 'ORGANIZE_NAMING_FAILED';
/** 도메인이 구현될 때마다 도메인 오류 코드 union을 여기에 합친다. */
export type BlinkErrorCode = CommonErrorCode | NoteErrorCode | AssistErrorCode | ProviderErrorCode | ExportErrorCode | OrganizeErrorCode;
```

- [ ] **Step 4: 구현**

```ts
// src/main/organize/application/folder-namer.ts
import type { LLMProvider } from '../../ai-provider/application/ports';
import { FolderName } from '../../note/domain/names';
import { DomainError } from '../../platform/errors';

/** 어디에도 안 맞는 노트가 가는 폴더 이름 (층마다 하나) */
export const UNSORTED = '미분류';
export const FOLDER_NAMES_SCHEMA = 'folder_names';

/** 층이 위일수록 보편적으로, 내려갈수록 구체적으로 — «넓게/좁게»라는 말 대신 예시로 넓이를 맞춘다 */
const LEVEL_EXAMPLES = ['공부, 요리, 운동, 업무', '코딩, 영어, 수학', 'Spring, Rust, 파이썬'] as const;

const SYSTEM = [
  '너는 노트 폴더 이름을 짓는다. 노트 제목 묶음마다 폴더 이름을 하나씩 짓는다.',
  '- 이름은 한 단어로 짓는다. 고유명사(Spring, Rust)도 된다. \\ / : * ? " < > | 는 쓰지 않는다.',
  '- «이번에 지을 층»의 예시와 같은 넓이로 짓는다. 위 층일수록 보편적으로, 아래 층일수록 구체적으로.',
  '- «지금 경로» 아래에 들어갈 하위 범주로 짓는다. 지금 경로에 있는 이름은 쓰지 않는다.',
  '- 묶음끼리 이름이 겹치지 않게 한다. «미분류»는 쓰지 않는다.',
  '- names 배열에 묶음 순서대로 이름만 넣는다.',
].join('\n');

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { names: { type: 'array', items: { type: 'string' } } },
  required: ['names'],
  additionalProperties: false,
};

export function folderNamingRequest(input: { parentPath: string; groups: readonly (readonly string[])[] }): {
  system: string;
  user: string;
} {
  const segments = input.parentPath.split('/').filter(Boolean);
  const level = segments.length + 1;
  const deeper = level > LEVEL_EXAMPLES.length ? ` (${LEVEL_EXAMPLES.length}층 예시보다 더 구체적으로)` : '';
  const user = [
    `지금 경로: ${segments.length > 0 ? segments.join(' > ') : '(맨 위)'}`,
    `이번에 지을 층: ${level}층${deeper}`,
    '층별 이름 예시:',
    ...LEVEL_EXAMPLES.map((example, i) => `${i + 1}층: ${example}`),
    '',
    ...input.groups.map((titles, i) => `묶음 ${i + 1}: ${titles.join(' / ')}`),
  ].join('\n');
  return { system: SYSTEM, user };
}

/** 묶음마다 폴더 이름. 쓸 수 없는 답이 오거나 AI 호출이 실패하면 ORGANIZE_NAMING_FAILED. */
export async function nameFolders(
  llm: LLMProvider,
  input: { parentPath: string; groups: readonly (readonly string[])[] },
  signal: AbortSignal,
): Promise<string[]> {
  const { system, user } = folderNamingRequest(input);
  let answer: unknown;
  try {
    answer = await llm.generateStructured({ system, user, schemaName: FOLDER_NAMES_SCHEMA, jsonSchema: SCHEMA, signal });
  } catch {
    // Provider 오류 메시지에는 요청 내용이 섞일 수 있어 그대로 내보내지 않는다.
    throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI could not name the folders');
  }
  const names = parseNames(answer, input.groups.length);
  if (!names) throw new DomainError('ORGANIZE_NAMING_FAILED', 'AI returned unusable folder names');
  return names;
}

function parseNames(answer: unknown, count: number): string[] | null {
  const names = (answer as { names?: unknown } | null)?.names;
  if (!Array.isArray(names) || names.length !== count) return null;
  const result: string[] = [];
  for (const raw of names) {
    if (typeof raw !== 'string') return null;
    let name: string;
    try {
      name = FolderName.of(raw).value; // 파일 이름 규칙 (금지 문자·길이·앞뒤 점)
    } catch {
      return null;
    }
    if (name === UNSORTED || result.some((r) => r.toLowerCase() === name.toLowerCase())) return null;
    result.push(name);
  }
  return result;
}
```

- [ ] **Step 5: 가짜 AI가 폴더 이름도 답하게** — `src/main/ai-provider/infrastructure/fake-llm-provider.ts`의 `generateStructured`를 이렇게 바꾼다 (개발 빌드에서 `BLINK_FAKE_LLM=1`로 API Key 없이 확인하기 위함)

```ts
        async generateStructured({ user, schemaName, signal }) {
          await wait(signal);
          guard(user);
          // organize의 폴더 이름 짓기 (FOLDER_NAMES_SCHEMA) — 묶음 수만큼 «묶음1», «묶음2»…
          if (schemaName === 'folder_names') {
            const count = user.split('\n').filter((line) => line.startsWith('묶음 ')).length;
            return { names: Array.from({ length: count }, (_, i) => `묶음${i + 1}`) };
          }
          return {
            version: 1,
            type: 'process',
            title: '처리 과정',
            nodes: [
              { id: '1', title: '노트 작성', description: user.slice(0, 40) },
              { id: '2', title: 'AI 처리', description: '선택 영역 분석' },
              { id: '3', title: '결과', description: '인포그래픽 생성' },
            ],
            edges: [
              ['1', '2'],
              ['2', '3'],
            ],
          };
        },
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm vitest run src/main/organize/application/folder-namer.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc/result.ts src/main/organize/application/folder-namer.ts src/main/organize/application/folder-namer.test.ts src/main/ai-provider/infrastructure/fake-llm-provider.ts
git commit -m "feat: name folders with the active llm using per-level examples and the current path"
```

---

### Task 5: 바깥 `.md` 파일 가져오기 (note 도메인)

**Files:**
- Modify: `src/shared/ipc/result.ts:2-15` (`NoteErrorCode`), `src/main/note/domain/names.ts` (끝에 추가), `src/main/note/infrastructure/vault/node-vault-file-system.ts` (import·인터페이스·메서드), `src/main/note/application/vault/vault-note-service.ts` (import·메서드)
- Test: `src/main/note/application/vault/import-file.test.ts`

**Interfaces:**
- Produces:
  - `numberedName(base: string, taken: ReadonlySet<string>): string` — `기본`, `기본 (2)`, `기본 (3)`…
  - `VaultFileSystem.importExternal(sourceAbsolute: string, to: string): void`
  - `VaultNoteService.importFile(input: { sourcePath: string; folder: string }): NoteDetail`
  - 오류 코드 `NOTE_IMPORT_INVALID`, `NOTE_IMPORT_LOCKED`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/note/application/vault/import-file.test.ts
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { numberedName } from '../../domain/names';
import { NodeVaultFileSystem } from '../../infrastructure/vault/node-vault-file-system';
import { SqliteNoteIndex } from '../../infrastructure/vault/sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from '../../infrastructure/vault/vault-index-db';
import { VaultNoteService } from './vault-note-service';

let dir: string;
let root: string;
let downloads: string;
let db: VaultIndexDatabase;
let notes: VaultNoteService;
let seq = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blink-import-'));
  root = join(dir, 'vault');
  downloads = join(dir, 'downloads');
  mkdirSync(root);
  mkdirSync(downloads);
  db = openVaultIndex(':memory:');
  notes = new VaultNoteService({
    fs: new NodeVaultFileSystem(root),
    index: new SqliteNoteIndex(db.db),
    clock: { now: () => new Date(0) },
    nextId: () => `id-${++seq}`,
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const download = (name: string, text = '# 내용') => {
  const path = join(downloads, name);
  writeFileSync(path, text);
  return path;
};
const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return null;
};

describe('numberedName', () => {
  it('adds (2), (3)… like Windows copies', () => {
    expect(numberedName('회의', new Set())).toBe('회의');
    expect(numberedName('회의', new Set(['회의']))).toBe('회의 (2)');
    expect(numberedName('회의', new Set(['회의', '회의 (2)']))).toBe('회의 (3)');
  });
});

describe('VaultNoteService.importFile', () => {
  it('moves an outside markdown file into the folder and indexes it', () => {
    mkdirSync(join(root, '공부'));
    const source = download('강의 정리.md');
    const note = notes.importFile({ sourcePath: source, folder: '공부' });
    expect(note).toMatchObject({ title: '강의 정리', path: '공부/강의 정리.md', content: '# 내용' });
    expect(existsSync(source)).toBe(false);
    expect(notes.tree().notes.map((n) => n.path)).toEqual(['공부/강의 정리.md']);
  });

  it('numbers the name when the folder already has it', () => {
    notes.importFile({ sourcePath: download('강의 정리.md'), folder: '' });
    const second = notes.importFile({ sourcePath: download('강의 정리.md', '# 두 번째'), folder: '' });
    expect(second.title).toBe('강의 정리 (2)');
  });

  it.each([
    ['non-markdown', () => download('사진.png')],
    ['missing', () => join(downloads, '없는 파일.md')],
    ['relative-path', () => '강의.md'],
  ])('refuses a %s file', (_case, source) => {
    expect(codeOf(() => notes.importFile({ sourcePath: source(), folder: '' }))).toBe('NOTE_IMPORT_INVALID');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/note/application/vault/import-file.test.ts`
Expected: FAIL — `numberedName` / `importFile` is not a function (또는 export 없음)

- [ ] **Step 3: 오류 코드 추가** — `src/shared/ipc/result.ts`의 `NoteErrorCode`에 두 줄을 더한다

```ts
  | 'VAULT_NOT_ACCESSIBLE'
  | 'NOTE_IMPORT_INVALID'
  | 'NOTE_IMPORT_LOCKED';
```

(기존 `| 'VAULT_NOT_ACCESSIBLE';`의 세미콜론을 지우고 위처럼 이어 쓴다.)

- [ ] **Step 4: 번호 이름** — `src/main/note/domain/names.ts` 끝에 추가

```ts
/** `기본`, 겹치면 `기본 (2)`, `기본 (3)`… — 윈도우 복사 이름과 같은 모양. 분류·가져오기에서 쓴다. (대소문자 무시) */
export function numberedName(base: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
```

- [ ] **Step 5: 파일 시스템에 «바깥 파일 옮겨 오기»** — `src/main/note/infrastructure/vault/node-vault-file-system.ts`

`node:fs` import 목록에 `constants`, `copyFileSync`를 더한다:

```ts
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch as watchFs,
  writeFileSync,
} from 'node:fs';
```

`VaultFileSystem` 인터페이스의 `rename(from: string, to: string): void;` 아래에 추가:

```ts
  /** 보관함 밖 파일(절대 경로)을 보관함 경로로 옮긴다. 다른 드라이브면 복사한 뒤 원본을 지운다. */
  importExternal(sourceAbsolute: string, to: string): void;
```

`NodeVaultFileSystem` 클래스의 `rename(...)` 메서드 아래에 추가:

```ts
  importExternal(sourceAbsolute: string, to: string): void {
    const target = this.absolute(to);
    try {
      renameSync(sourceAbsolute, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      copyFileSync(sourceAbsolute, target, constants.COPYFILE_EXCL);
      rmSync(sourceAbsolute);
    }
  }
```

- [ ] **Step 6: 가져오기 유스케이스** — `src/main/note/application/vault/vault-note-service.ts`

import를 바꾼다: `import { NoteName, uniqueName } from '../../domain/names';` → `import { NoteName, numberedName, uniqueName } from '../../domain/names';`

`move(...)` 메서드 아래에 추가:

```ts
  /** 보관함 밖 `.md` 파일을 폴더로 옮겨 와 노트로 만든다. 같은 이름이 있으면 `이름 (2)`. */
  importFile(input: { sourcePath: string; folder: string }): NoteDetail {
    const { fs, index, nextId } = this.deps;
    const fileName = input.sourcePath.split(/[\\/]/).pop() ?? '';
    const absolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(input.sourcePath);
    if (!absolute || !/\.md$/i.test(fileName)) {
      throw new DomainError('NOTE_IMPORT_INVALID', `Not an importable markdown file: ${fileName}`);
    }
    const folder = FolderPath.of(input.folder);
    if (!folder.isRoot && !fs.exists(folder.value)) throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder.value} not found`);
    const taken = new Set(
      fs
        .listMarkdownFiles()
        .map((f) => NotePath.of(f.path))
        .filter((p) => p.folder.toLowerCase() === folder.value.toLowerCase())
        .map((p) => p.name),
    );
    const path = NotePath.in(folder, NoteName.of(numberedName(fileName.replace(/\.md$/i, ''), taken)));
    try {
      fs.importExternal(input.sourcePath, path.value);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        throw new DomainError('NOTE_IMPORT_LOCKED', `${fileName} is open in another program`);
      }
      throw new DomainError('NOTE_IMPORT_INVALID', `Could not import ${fileName}`);
    }
    // 감시 이벤트보다 먼저 색인을 맞춰 두면 자기 변경을 외부 변경으로 보지 않는다.
    const entry = readEntry(fs, path.value, nextId())!;
    index.upsert(entry);
    return this.detail(entry, fs.read(path.value));
  }
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm vitest run src/main/note/application/vault/import-file.test.ts src/main/note`
Expected: PASS (새 테스트 6개 + 기존 note 테스트 전부)

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc/result.ts src/main/note/domain/names.ts src/main/note/infrastructure/vault/node-vault-file-system.ts src/main/note/application/vault/vault-note-service.ts src/main/note/application/vault/import-file.test.ts
git commit -m "feat: import an outside markdown file into a vault folder with numbered names"
```

---

### Task 6: 분류 서비스 (미리보기 · 옮기기 · 자동 배치 · 가져오기)

**Files:**
- Create: `src/shared/ipc/organize.ts`, `src/main/organize/application/organize-service.ts`
- Test: `src/main/organize/application/organize-service.test.ts`

**Interfaces:**
- Consumes: Task 1~5 전부, `VaultTree`·`NoteSummary`·`NoteDetail`·`RelocateNoteResult` (`src/shared/ipc/notes.ts`), `ActiveModel` (`src/main/ai-provider/application/active-llm.ts`)
- Produces:
  - `src/shared/ipc/organize.ts`: `PlannedNote`, `OrganizePlan`, `OrganizeApplyResult`, `PlaceNoteResult`, `ImportNoteResult` (아래 코드)
  - `OrganizeNotePort`, `OrganizeFolderPort`, `OrganizeDeps`
  - `class OrganizeService { preview(folder: string): Promise<OrganizePlan>; apply(plan: OrganizePlan): OrganizeApplyResult; place(noteId: string): PlaceNoteResult; importFile(input: { sourcePath: string; folder: string }): ImportNoteResult }`

- [ ] **Step 1: IPC 계약 타입 작성**

```ts
// src/shared/ipc/organize.ts
/** organize 도메인 IPC 계약 타입 — 소웨공/Phase1_파일분류_계획서.md */
import type { NoteId } from './notes';

export interface PlannedNote {
  id: NoteId;
  title: string;
  /** 지금 폴더 ('' = 맨 위) */
  from: string;
}

/** 분류하기 미리보기. 이대로 organize:apply에 넘기면 옮긴다. */
export interface OrganizePlan {
  /** 분류를 누른 폴더 ('' = 보관함 맨 위) */
  folder: string;
  /** 새로 만들 하위 폴더 (AI가 지은 이름)와 그리로 갈 노트 */
  newFolders: { name: string; notes: PlannedNote[] }[];
  /** 이미 있는 폴더(또는 「미분류」)로 갈 노트 */
  moves: (PlannedNote & { to: string })[];
  /** 옮길 것이 하나도 없을 때 그 이유 */
  skipped: 'TOO_FEW_NOTES' | 'NO_CLEAR_GROUPS' | null;
}

export interface OrganizeApplyResult {
  movedNotes: number;
  createdFolders: string[];
  /** 링크가 고쳐진 다른 노트 */
  updatedNoteIds: NoteId[];
}

export interface PlaceNoteResult {
  /** 노트가 최종적으로 들어간 폴더 */
  folder: string;
  updatedNoteIds: NoteId[];
}

export interface ImportNoteResult {
  noteId: NoteId;
  folder: string;
  updatedNoteIds: NoteId[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// src/main/organize/application/organize-service.test.ts
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelCapabilities } from '../../ai-provider/domain/model-capabilities';
import { fakeProvider } from '../../ai-provider/testing';
import { FolderService } from '../../note/application/vault/folder-service';
import { IndexSync } from '../../note/application/vault/index-sync';
import { VaultNoteService } from '../../note/application/vault/vault-note-service';
import { NodeVaultFileSystem } from '../../note/infrastructure/vault/node-vault-file-system';
import { SqliteNoteIndex } from '../../note/infrastructure/vault/sqlite-note-index';
import { openVaultIndex, type VaultIndexDatabase } from '../../note/infrastructure/vault/vault-index-db';
import { DomainError } from '../../platform/errors';
import { OrganizeService } from './organize-service';

const SPRING = ['spring boot 실무 1편', 'spring boot 실무 2편', 'spring boot 실무 3편'];
const RUST = ['rust 소유권 정리', 'rust 소유권 활용', 'rust 소유권 심화'];

let dir: string;
let root: string;
let db: VaultIndexDatabase;
let notes: VaultNoteService;
let sync: IndexSync;
let organize: OrganizeService;
let llmConfigured: boolean;
/** 가짜 AI: 묶음 줄에 spring이 있으면 Spring, rust면 Rust */
const namer = vi.fn(async ({ user }: { user: string }) => ({
  names: user
    .split('\n')
    .filter((line) => line.startsWith('묶음 '))
    .map((line) => (line.includes('spring') ? 'Spring' : line.includes('rust') ? 'Rust' : '기타')),
}));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blink-organize-'));
  root = join(dir, 'vault');
  mkdirSync(root);
  db = openVaultIndex(':memory:');
  let seq = 0;
  const deps = {
    fs: new NodeVaultFileSystem(root),
    index: new SqliteNoteIndex(db.db),
    clock: { now: () => new Date(0) },
    nextId: () => `id-${++seq}`,
  };
  notes = new VaultNoteService(deps);
  const folders = new FolderService(deps);
  sync = new IndexSync(deps);
  namer.mockClear();
  llmConfigured = true;
  organize = new OrganizeService({
    notes: () => notes,
    folders: () => folders,
    activeLLM: {
      resolve: () => {
        if (!llmConfigured) throw new DomainError('AI_PROVIDER_NOT_CONFIGURED', 'No usable AI provider is configured');
        return {
          provider: 'openai' as const,
          model: 'test',
          capabilities: new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: false }),
          client: fakeProvider({ generateStructured: namer }),
        };
      },
    },
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 보관함 폴더에 빈 노트 파일을 만들고 색인한다 */
const seed = (folder: string, ...titles: string[]) => {
  const segments = folder.split('/').filter(Boolean);
  mkdirSync(join(root, ...segments), { recursive: true });
  for (const title of titles) writeFileSync(join(root, ...segments, `${title}.md`), '');
  sync.full();
};
const idOf = (title: string, folder = '') => notes.tree().notes.find((n) => n.title === title && n.folder === folder)!.id;
const titlesIn = (folder: string) =>
  notes
    .tree()
    .notes.filter((n) => n.folder === folder)
    .map((n) => n.title)
    .sort();
const codeOf = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return null;
};

describe('preview', () => {
  it('groups two topics into new folders named by the AI, without moving anything yet', async () => {
    seed('', ...SPRING, ...RUST);
    const plan = await organize.preview('');
    expect(plan.skipped).toBeNull();
    expect(plan.moves).toEqual([]);
    const groups = plan.newFolders.map((f) => [f.name, f.notes.map((n) => n.title).sort()]).sort();
    expect(groups).toEqual([
      ['Rust', [...RUST].sort()],
      ['Spring', [...SPRING].sort()],
    ]);
    expect(namer).toHaveBeenCalledTimes(1);
    expect(titlesIn('')).toHaveLength(6);
  });

  it('puts notes that fit an existing subfolder there and the rest into 미분류', async () => {
    seed('Spring', ...SPRING);
    seed('', 'spring boot 실무 4편', '김치찌개 레시피', '스쿼트 자세');
    const plan = await organize.preview('');
    expect(plan.newFolders).toEqual([]);
    expect(plan.moves.map((m) => [m.title, m.to]).sort()).toEqual(
      [
        ['spring boot 실무 4편', 'Spring'],
        ['김치찌개 레시피', '미분류'],
        ['스쿼트 자세', '미분류'],
      ].sort(),
    );
    expect(namer).not.toHaveBeenCalled();
  });

  it('says so when nothing groups clearly', async () => {
    seed('', 'spring boot 실무 1편', '김치찌개 레시피', '스쿼트 자세', '영어 회화 표현', 'rust 소유권 정리', '자료구조 스택');
    await expect(organize.preview('')).resolves.toMatchObject({ newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' });
  });

  it('says so when there are fewer than 3 notes', async () => {
    seed('', 'spring boot 실무 1편', '김치찌개 레시피');
    await expect(organize.preview('')).resolves.toMatchObject({ skipped: 'TOO_FEW_NOTES' });
  });

  it('refuses to classify inside 미분류', async () => {
    seed('미분류', 'a 노트');
    expect(await codeOf(() => organize.preview('미분류'))).toBe('VALIDATION_FAILED');
  });

  it('needs a configured AI only when new folders must be named', async () => {
    llmConfigured = false;
    seed('', ...SPRING, ...RUST);
    expect(await codeOf(() => organize.preview(''))).toBe('AI_PROVIDER_NOT_CONFIGURED');
  });
});

describe('apply', () => {
  it('creates the folders and moves the notes as previewed', async () => {
    seed('', ...SPRING, ...RUST);
    const result = organize.apply(await organize.preview(''));
    expect(result.createdFolders.sort()).toEqual(['Rust', 'Spring']);
    expect(result.movedNotes).toBe(6);
    expect(titlesIn('Spring')).toEqual([...SPRING].sort());
    expect(titlesIn('Rust')).toEqual([...RUST].sort());
  });

  it('creates 미분류 when needed and skips notes deleted after the preview', async () => {
    seed('Spring', ...SPRING);
    seed('', 'spring boot 실무 4편', '김치찌개 레시피', '스쿼트 자세');
    const plan = await organize.preview('');
    notes.delete(idOf('스쿼트 자세'));
    expect(organize.apply(plan)).toMatchObject({ movedNotes: 2, createdFolders: ['미분류'] });
    expect(titlesIn('미분류')).toEqual(['김치찌개 레시피']);
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });
});

describe('place', () => {
  beforeEach(() => {
    seed('Spring', ...SPRING);
    seed('Rust', 'rust 소유권 정리', 'rust 소유권 활용');
  });

  it('moves a new note into the subfolder it fits', () => {
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('Spring');
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });

  it('sends a note that fits nowhere to 미분류 of that level', () => {
    seed('', '김치찌개 레시피');
    expect(organize.place(idOf('김치찌개 레시피')).folder).toBe('미분류');
  });

  it('numbers the title when the target folder already has it', () => {
    seed('', 'spring boot 실무 1편');
    expect(organize.place(idOf('spring boot 실무 1편', '')).folder).toBe('Spring');
    expect(titlesIn('Spring')).toContain('spring boot 실무 1편 (2)');
  });

  it('works without an AI', () => {
    llmConfigured = false;
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('Spring');
  });
});

describe('place across levels', () => {
  it('goes down several levels', () => {
    seed('공부/Spring', ...SPRING);
    seed('공부/Rust', ...RUST);
    seed('요리', '김치찌개 레시피', '된장찌개 레시피', '부대찌개 레시피');
    seed('', 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편')).folder).toBe('공부/Spring');
  });

  it('starts from the folder the note was created in', () => {
    seed('공부/Spring', ...SPRING);
    seed('공부/Rust', ...RUST);
    seed('공부', 'rust 소유권 입문');
    expect(organize.place(idOf('rust 소유권 입문', '공부')).folder).toBe('공부/Rust');
  });

  it('leaves the note where it is when the folder has no subfolders', () => {
    seed('', ...RUST, 'spring boot 실무 4편');
    expect(organize.place(idOf('spring boot 실무 4편'))).toEqual({ folder: '', updatedNoteIds: [] });
  });
});

describe('importFile', () => {
  it('brings an outside .md in and places it', () => {
    seed('Spring', ...SPRING);
    const source = join(dir, 'spring boot 실무 4편.md');
    writeFileSync(source, '# 4편');
    expect(organize.importFile({ sourcePath: source, folder: '' }).folder).toBe('Spring');
    expect(existsSync(source)).toBe(false);
    expect(titlesIn('Spring')).toContain('spring boot 실무 4편');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run src/main/organize/application/organize-service.test.ts`
Expected: FAIL — `Failed to resolve import "./organize-service"`

- [ ] **Step 4: 구현**

```ts
// src/main/organize/application/organize-service.ts
import type { NoteDetail, NoteSummary, RelocateNoteResult, VaultTree } from '../../../shared/ipc/notes';
import type {
  ImportNoteResult,
  OrganizeApplyResult,
  OrganizePlan,
  PlaceNoteResult,
  PlannedNote,
} from '../../../shared/ipc/organize';
import type { ActiveModel } from '../../ai-provider/application/active-llm';
import { numberedName } from '../../note/domain/names';
import { DomainError } from '../../platform/errors';
import { bestClustering, MIN_NOTES, MIN_SILHOUETTE } from '../domain/clustering';
import { closerNewGroup, fittingFolder } from '../domain/placement';
import { subMatrix, titleSimilarity } from '../domain/similarity';
import { nameFolders, UNSORTED } from './folder-namer';

const NAMING_TIMEOUT_MS = 60_000;

/** note 도메인 공개 API 중 organize가 쓰는 부분 (VaultNoteService가 만족한다). */
export interface OrganizeNotePort {
  tree(): VaultTree;
  move(input: { id: string; folder: string }): RelocateNoteResult;
  rename(input: { id: string; title: string }): RelocateNoteResult;
  importFile(input: { sourcePath: string; folder: string }): NoteDetail;
}

/** note 도메인 공개 API 중 organize가 쓰는 부분 (FolderService가 만족한다). */
export interface OrganizeFolderPort {
  create(input: { parent?: string; name: string }): { path: string };
}

export interface OrganizeDeps {
  /** 열린 보관함의 노트 — 보관함이 바뀔 수 있어 매번 가져온다 */
  notes(): OrganizeNotePort;
  folders(): OrganizeFolderPort;
  activeLLM: { resolve(): ActiveModel };
  /** 기본 MIN_SILHOUETTE */
  minSilhouette?: number;
}

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const nameOf = (folder: string) => folder.split('/').pop() ?? '';
const parentOf = (folder: string) => folder.split('/').slice(0, -1).join('/');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isUnder = (path: string, folder: string) => same(path, folder) || path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
/** 폴더 바로 아래 하위 폴더 (「미분류」 제외) */
const childFolders = (tree: VaultTree, folder: string) =>
  tree.folders.filter((f) => same(parentOf(f), folder) && nameOf(f) !== UNSORTED);
/** 폴더(하위 포함) 안의 노트 */
const notesUnder = (tree: VaultTree, folder: string, exceptId?: string) =>
  tree.notes.filter((n) => n.id !== exceptId && isUnder(n.folder, folder));
const planned = (note: NoteSummary): PlannedNote => ({ id: note.id, title: note.title, from: note.folder });

/** 노트 제목으로 폴더를 나누고 새 노트를 맞는 폴더에 넣는다 (소웨공/Phase1_파일분류_계획서.md). */
export class OrganizeService {
  constructor(private readonly deps: OrganizeDeps) {}

  /** 분류하기 1단계: 옮길 계획만 만든다. 아무것도 옮기지 않는다. */
  async preview(folder: string): Promise<OrganizePlan> {
    const tree = this.deps.notes().tree();
    if (folder !== '' && !tree.folders.some((f) => same(f, folder))) {
      throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder} not found`);
    }
    if (nameOf(folder) === UNSORTED) throw new DomainError('VALIDATION_FAILED', 'The unsorted folder is not classified');

    const unsorted = join(folder, UNSORTED);
    const candidates = tree.notes.filter((n) => same(n.folder, folder) || same(n.folder, unsorted));
    const subfolders = childFolders(tree, folder);
    const members = subfolders.map((path) => notesUnder(tree, path));
    const everyone = [...candidates, ...members.flat()];
    const sim = titleSimilarity(everyone.map((n) => n.title));
    const indexOf = new Map(everyone.map((n, i) => [n.id, i]));
    const at = (note: NoteSummary) => indexOf.get(note.id)!;
    const shapes = subfolders.map((path, i) => ({ path, members: members[i]!.map(at) }));

    // 1. 이미 있는 하위 폴더에 맞는 노트는 그 폴더로
    const moves: OrganizePlan['moves'] = [];
    const remaining: NoteSummary[] = [];
    for (const note of candidates) {
      const fit = fittingFolder(sim, at(note), shapes);
      if (fit) moves.push({ ...planned(note), to: fit });
      else remaining.push(note);
    }

    // 2. 남은 노트끼리 묶는다. 2개 이상인 묶음만 새 폴더가 된다
    const clustering = bestClustering(subMatrix(sim, remaining.map(at)), {
      minScore: this.deps.minSilhouette ?? MIN_SILHOUETTE,
    });
    const groups: NoteSummary[][] = [];
    const leftovers: NoteSummary[] = [];
    if (clustering) {
      const byLabel = new Map<number, NoteSummary[]>();
      remaining.forEach((note, i) => {
        const label = clustering.labels[i]!;
        byLabel.set(label, [...(byLabel.get(label) ?? []), note]);
      });
      for (const group of byLabel.values()) {
        if (group.length >= 2) groups.push(group);
        else leftovers.push(...group);
      }
    } else {
      leftovers.push(...remaining);
    }

    // 3. 형제 폴더에 바로 있는 노트 중 자기 폴더보다 새 묶음 대표 위치에 더 가까운 노트는 새 묶음으로
    const groupIndexes = groups.map((group) => group.map(at));
    for (const shape of shapes) {
      for (const note of tree.notes.filter((n) => same(n.folder, shape.path))) {
        const target = closerNewGroup(sim, at(note), shape.members, groupIndexes);
        if (target !== null) groups[target]!.push(note);
      }
    }

    // 4. 어디에도 못 간 노트: 하위 폴더가 있거나 생기면 「미분류」로, 아니면 그대로
    if (subfolders.length > 0 || groups.length > 0) {
      for (const note of leftovers) if (!same(note.folder, unsorted)) moves.push({ ...planned(note), to: unsorted });
    }

    // 5. 새 폴더 이름 — 분류하기 한 번에 AI 한 번
    const names = groups.length === 0 ? [] : await this.nameGroups(folder, groups);
    const nothing = groups.length === 0 && moves.length === 0;
    return {
      folder,
      newFolders: groups.map((group, i) => ({ name: names[i]!, notes: group.map(planned) })),
      moves,
      skipped: nothing ? (remaining.length < MIN_NOTES ? 'TOO_FEW_NOTES' : 'NO_CLEAR_GROUPS') : null,
    };
  }

  /** 분류하기 2단계: 미리보기대로 옮긴다. 그사이 사라진 노트는 건너뛴다. */
  apply(plan: OrganizePlan): OrganizeApplyResult {
    const createdFolders: string[] = [];
    const updatedNoteIds = new Set<string>();
    let movedNotes = 0;
    const moveInto = (id: string, folder: string) => {
      const result = this.moveNumbered(id, folder);
      if (!result) return;
      movedNotes += 1;
      for (const updated of result.updatedNoteIds) updatedNoteIds.add(updated);
    };
    for (const group of plan.newFolders) {
      const path = this.ensureFolder(plan.folder, group.name, createdFolders);
      for (const note of group.notes) moveInto(note.id, path);
    }
    for (const move of plan.moves) moveInto(move.id, this.ensureFolder(parentOf(move.to), nameOf(move.to), createdFolders));
    return { movedNotes, createdFolders, updatedNoteIds: [...updatedNoteIds] };
  }

  /** 새 노트 자동 배치: 지금 폴더를 맨 위로 보고 한 층씩 내려간다. 맞는 하위 폴더가 없으면 그 층의 「미분류」. */
  place(noteId: string): PlaceNoteResult {
    const tree = this.deps.notes().tree();
    const note = tree.notes.find((n) => n.id === noteId);
    if (!note) throw new DomainError('NOTE_NOT_FOUND', `Note ${noteId} not found`);
    let level = nameOf(note.folder) === UNSORTED ? parentOf(note.folder) : note.folder;
    for (;;) {
      const subfolders = childFolders(tree, level);
      if (subfolders.length === 0) break;
      const members = subfolders.map((path) => notesUnder(tree, path, noteId));
      const sim = titleSimilarity([note.title, ...members.flat().map((n) => n.title)]);
      let offset = 1; // 0번은 새 노트
      const shapes = subfolders.map((path, i) => {
        const indexes = members[i]!.map((_, j) => offset + j);
        offset += indexes.length;
        return { path, members: indexes };
      });
      const fit = fittingFolder(sim, 0, shapes);
      if (!fit) {
        level = join(level, UNSORTED);
        break;
      }
      level = fit;
    }
    if (same(level, note.folder)) return { folder: note.folder, updatedNoteIds: [] };
    if (level !== '') this.ensureFolder(parentOf(level), nameOf(level));
    const moved = this.moveNumbered(noteId, level);
    return { folder: moved?.note.folder ?? note.folder, updatedNoteIds: moved?.updatedNoteIds ?? [] };
  }

  /** 끌어다 놓은 바깥 `.md`: 놓은 폴더로 가져온 뒤 그 폴더부터 자동 배치 */
  importFile(input: { sourcePath: string; folder: string }): ImportNoteResult {
    const note = this.deps.notes().importFile(input);
    const placed = this.place(note.id);
    return { noteId: note.id, folder: placed.folder, updatedNoteIds: placed.updatedNoteIds };
  }

  private async nameGroups(folder: string, groups: NoteSummary[][]): Promise<string[]> {
    const active = this.deps.activeLLM.resolve(); // 설정이 없으면 AI_PROVIDER_NOT_CONFIGURED
    if (!active.capabilities.supportsAll(['structuredOutput'])) {
      throw new DomainError('AI_CAPABILITY_UNSUPPORTED', `${active.model} cannot return structured output`);
    }
    return nameFolders(
      active.client,
      { parentPath: folder, groups: groups.map((group) => group.map((n) => n.title)) },
      AbortSignal.timeout(NAMING_TIMEOUT_MS),
    );
  }

  /** 있으면 그 폴더, 없으면 만든다 (AI가 지은 이름이 이미 있는 폴더와 같으면 합친다). */
  private ensureFolder(parent: string, name: string, created?: string[]): string {
    const path = join(parent, name);
    const existing = this.deps.notes().tree().folders.find((f) => same(f, path));
    if (existing) return existing;
    const made = this.deps.folders().create(parent ? { parent, name } : { name }).path;
    created?.push(made);
    return made;
  }

  /** 옮길 폴더에 같은 제목이 있으면 `제목 (2)`로 바꾼 뒤 옮긴다. 노트가 없어졌으면 null. */
  private moveNumbered(id: string, folder: string): RelocateNoteResult | null {
    const notes = this.deps.notes();
    try {
      return notes.move({ id, folder });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOTE_NOT_FOUND') return null;
      if (!(error instanceof DomainError && error.code === 'NOTE_TITLE_TAKEN')) throw error;
    }
    const tree = notes.tree();
    const current = tree.notes.find((n) => n.id === id);
    if (!current) return null;
    const taken = new Set(
      tree.notes.filter((n) => same(n.folder, folder) || same(n.folder, current.folder)).map((n) => n.title),
    );
    const renamed = notes.rename({ id, title: numberedName(current.title, taken) });
    const moved = notes.move({ id, folder });
    return { note: moved.note, updatedNoteIds: [...new Set([...renamed.updatedNoteIds, ...moved.updatedNoteIds])] };
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/main/organize`
Expected: PASS (Task 1~4 테스트 + 이 파일 18개)

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc/organize.ts src/main/organize/application/organize-service.ts src/main/organize/application/organize-service.test.ts
git commit -m "feat: preview, apply, auto-place and import notes by title clustering"
```

---

### Task 7: IPC 연결 (Main · Preload · 가짜 Blink)

**Files:**
- Create: `src/main/organize/presentation/organize.ipc.ts`
- Modify: `src/shared/ipc/channels.ts:28`, `src/shared/ipc/schemas.ts` (끝에 추가), `src/shared/ipc/blink-api.ts`, `src/main/bootstrap.ts`, `src/preload/raw-api.ts`, `src/preload/index.ts`, `src/renderer/mocks/createMockBlink.ts`
- Test: `src/main/organize/presentation/organize.ipc.test.ts`, `src/preload/raw-api.test.ts` (테스트 1개 추가)

**Interfaces:**
- Consumes: `OrganizeService` (Task 6), 타입 (Task 6 Step 1)
- Produces:
  - 채널 `organize:preview` `{ folder }`, `organize:apply` `OrganizePlan`, `organize:place` `{ id }`, `organize:import` `{ sourcePath, folder }`
  - `BlinkApi.organize` = `{ preview, apply, place, importFile, pathForFile(file: File): string }`
  - `MockBlinkOptions.organizePreview?: (folder: string) => OrganizePlan`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/main/organize/presentation/organize.ipc.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { VaultTree } from '../../../shared/ipc/notes';
import { OrganizeService } from '../application/organize-service';
import { organizeIpcHandlers } from './organize.ipc';

const id = '11111111-1111-4111-8111-111111111111';
const tree: VaultTree = {
  folders: [],
  notes: [{ id, title: '회의', path: '회의.md', folder: '', preview: '', updatedAt: '' }],
};
const handlers = organizeIpcHandlers(
  new OrganizeService({
    notes: () => ({ tree: () => tree, move: vi.fn(), rename: vi.fn(), importFile: vi.fn() }),
    folders: () => ({ create: vi.fn() }),
    activeLLM: {
      resolve: () => {
        throw new Error('the AI is not used in these tests');
      },
    },
  }),
);
const call = (channel: string, request: unknown) => handlers[channel]!(request);

describe('organizeIpcHandlers', () => {
  it('exposes the organize channels', () => {
    expect(Object.keys(handlers).sort()).toEqual(['organize:apply', 'organize:import', 'organize:place', 'organize:preview']);
  });

  it('places a note through an envelope', async () => {
    await expect(call('organize:place', { id })).resolves.toEqual({ ok: true, data: { folder: '', updatedNoteIds: [] } });
  });

  it('previews too few notes without calling the AI', async () => {
    await expect(call('organize:preview', { folder: '' })).resolves.toMatchObject({ ok: true, data: { skipped: 'TOO_FEW_NOTES' } });
  });

  it('rejects malformed requests', async () => {
    await expect(call('organize:place', { id: 'nope' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    await expect(call('organize:import', { sourcePath: '', folder: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('organize:apply', { folder: '' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });
});
```

`src/preload/raw-api.test.ts`의 마지막 `});` 앞에 추가:

```ts
  it('maps organize methods to organize channels and passes file paths through', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: null });
    const api = createRawBlinkApi(invoke, noSubscribe, (file) => `C:/Downloads/${file.name}`);
    const id = '11111111-1111-4111-8111-111111111111';
    const plan = { folder: '', newFolders: [], moves: [], skipped: null };

    await api.organize.preview({ folder: '' });
    await api.organize.apply(plan);
    await api.organize.place({ id });
    await api.organize.importFile({ sourcePath: 'C:/a.md', folder: '' });

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'organize:preview',
      'organize:apply',
      'organize:place',
      'organize:import',
    ]);
    expect(api.organize.pathForFile(new File([''], '강의.md'))).toBe('C:/Downloads/강의.md');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/main/organize/presentation src/preload`
Expected: FAIL — `Failed to resolve import "./organize.ipc"`, `api.organize` is undefined

- [ ] **Step 3: 채널** — `src/shared/ipc/channels.ts`의 `visualizationSavePng: 'visualization:save-png',` 아래에 추가

```ts
  organizePreview: 'organize:preview',
  organizeApply: 'organize:apply',
  organizePlace: 'organize:place',
  organizeImport: 'organize:import',
```

- [ ] **Step 4: 전송 검증** — `src/shared/ipc/schemas.ts` 끝에 추가

```ts
const PlannedNoteSchema = z.object({ id: NoteIdSchema, title: z.string().max(1000), from: RelativePathSchema }).strict();

export const OrganizeFolderRequest = z.object({ folder: RelativePathSchema }).strict();

export const OrganizeApplyRequest = z
  .object({
    folder: RelativePathSchema,
    newFolders: z.array(z.object({ name: z.string().max(1000), notes: z.array(PlannedNoteSchema).max(10_000) }).strict()).max(5_000),
    moves: z
      .array(z.object({ id: NoteIdSchema, title: z.string().max(1000), from: RelativePathSchema, to: RelativePathSchema }).strict())
      .max(10_000),
    skipped: z.enum(['TOO_FEW_NOTES', 'NO_CLEAR_GROUPS']).nullable(),
  })
  .strict();

export const PlaceNoteRequest = z.object({ id: NoteIdSchema }).strict();

// 파일 확장자·절대 경로 여부는 도메인(NOTE_IMPORT_INVALID)이 검사한다.
export const ImportNoteRequest = z.object({ sourcePath: z.string().min(1).max(1000), folder: RelativePathSchema }).strict();
```

- [ ] **Step 5: IPC 핸들러**

```ts
// src/main/organize/presentation/organize.ipc.ts
import { IpcChannels } from '../../../shared/ipc/channels';
import { ImportNoteRequest, OrganizeApplyRequest, OrganizeFolderRequest, PlaceNoteRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { OrganizeService } from '../application/organize-service';

export function organizeIpcHandlers(organize: OrganizeService): IpcHandlerMap {
  return {
    [IpcChannels.organizePreview]: createIpcHandler(OrganizeFolderRequest, (r) => organize.preview(r.folder)),
    [IpcChannels.organizeApply]: createIpcHandler(OrganizeApplyRequest, (r) => organize.apply(r)),
    [IpcChannels.organizePlace]: createIpcHandler(PlaceNoteRequest, (r) => organize.place(r.id)),
    [IpcChannels.organizeImport]: createIpcHandler(ImportNoteRequest, (r) => organize.importFile(r)),
  };
}
```

- [ ] **Step 6: Composition Root** — `src/main/bootstrap.ts`

import 목록(`noteIpcHandlers` 줄 아래)에 추가:

```ts
import { OrganizeService } from './organize/application/organize-service';
import { organizeIpcHandlers } from './organize/presentation/organize.ipc';
```

`const activeLLM = new ActiveLLM(providerRepo, cipher, llmFactory);` 아래에 추가:

```ts
  const organize = new OrganizeService({
    notes: () => vaults.session().notes,
    folders: () => vaults.session().folders,
    activeLLM,
  });
```

`registerIpcHandlers(...)`의 `...visualizationIpcHandlers(exportPng),` 아래에 추가:

```ts
      ...organizeIpcHandlers(organize),
```

- [ ] **Step 7: API 타입** — `src/shared/ipc/blink-api.ts`

import에 추가:

```ts
import type { ImportNoteResult, OrganizeApplyResult, OrganizePlan, PlaceNoteResult } from './organize';
```

`BlinkApi`의 `settings: { … };` 블록 아래(인터페이스 닫는 `}` 앞)에 추가:

```ts
  organize: {
    preview(input: { folder: string }): Promise<OrganizePlan>;
    apply(input: OrganizePlan): Promise<OrganizeApplyResult>;
    place(input: { id: NoteId }): Promise<PlaceNoteResult>;
    importFile(input: { sourcePath: string; folder: string }): Promise<ImportNoteResult>;
    /** 끌어다 놓은 파일의 실제 경로 (Electron webUtils). IPC가 아니라 Preload에서 바로 답한다. */
    pathForFile(file: File): string;
  };
```

- [ ] **Step 8: Preload** — `src/preload/raw-api.ts`

함수 시그니처를 바꾼다:

```ts
export function createRawBlinkApi(
  invoke: Invoke,
  subscribe: Subscribe,
  pathForFile: (file: File) => string = () => '',
): RawBlinkApi {
```

반환 객체의 `settings: { … },` 아래에 추가:

```ts
    organize: {
      preview: (input) => call(IpcChannels.organizePreview, input),
      apply: (input) => call(IpcChannels.organizeApply, input),
      place: (input) => call(IpcChannels.organizePlace, input),
      importFile: (input) => call(IpcChannels.organizeImport, input),
      pathForFile,
    },
```

`src/preload/index.ts` 전체:

```ts
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { createRawBlinkApi } from './raw-api';

contextBridge.exposeInMainWorld(
  'blink',
  createRawBlinkApi(
    (channel, request) => ipcRenderer.invoke(channel, request),
    (channel, listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    // Electron 32부터 File.path가 없어져 webUtils로 끌어다 놓은 파일의 경로를 읽는다.
    (file) => webUtils.getPathForFile(file),
  ),
);
```

- [ ] **Step 9: 가짜 Blink** — `src/renderer/mocks/createMockBlink.ts`

import에 추가:

```ts
import type { OrganizePlan } from '../../shared/ipc/organize';
```

`MockBlinkOptions`에 추가:

```ts
  /** organize:preview가 돌려줄 계획. 없으면 «나눌 만한 묶음 없음». */
  organizePreview?: (folder: string) => OrganizePlan;
```

반환 객체의 `settings: { … },` 아래에 추가:

```ts
    organize: {
      preview: ({ folder }) =>
        ok<OrganizePlan>(options.organizePreview?.(folder) ?? { folder, newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' }),
      apply: (plan) => {
        const createdFolders: string[] = [];
        let movedNotes = 0;
        const ensure = (path: string) => {
          if (folders.has(path)) return;
          folders.add(path);
          createdFolders.push(path);
        };
        const moveTo = (id: string, folder: string) => {
          const note = notes.get(id);
          if (!note) return;
          note.path = inFolder(folder, note.path.split('/').pop()!);
          movedNotes += 1;
        };
        for (const group of plan.newFolders) {
          const path = inFolder(plan.folder, group.name);
          ensure(path);
          for (const note of group.notes) moveTo(note.id, path);
        }
        for (const move of plan.moves) {
          ensure(move.to);
          moveTo(move.id, move.to);
        }
        return ok({ movedNotes, createdFolders, updatedNoteIds: [] });
      },
      place: ({ id }) => {
        const note = notes.get(id);
        return note ? ok({ folder: folderOf(note.path), updatedNoteIds: [] }) : fail('NOTE_NOT_FOUND', id);
      },
      importFile: ({ sourcePath }) => fail('NOTE_IMPORT_INVALID', `Mock cannot read ${sourcePath}`),
      pathForFile: (file) => file.name,
    },
```

- [ ] **Step 10: 통과 확인**

Run: `pnpm vitest run src/main/organize src/preload && pnpm typecheck`
Expected: PASS, typecheck 오류 0

- [ ] **Step 11: Commit**

```bash
git add src/shared/ipc/channels.ts src/shared/ipc/schemas.ts src/shared/ipc/blink-api.ts src/main/organize/presentation src/main/bootstrap.ts src/preload src/renderer/mocks/createMockBlink.ts
git commit -m "feat: expose organize preview, apply, place and import over ipc"
```

---

### Task 8: 화면 (분류하기 · 미리보기 · 첫 제목 자동 배치 · 끌어다 놓기)

**Files:**
- Create: `src/renderer/features/organize/api/organize-queries.ts`, `src/renderer/features/organize/components/OrganizeDialog.tsx`
- Modify: `src/renderer/features/notes/api/note-queries.ts:196`, `src/renderer/features/notes/components/NoteTree.tsx`, `src/renderer/features/notes/components/TitleInput.tsx`, `src/renderer/app/Sidebar.tsx`
- Test: `src/renderer/features/organize/organize.flow.test.tsx`

**Interfaces:**
- Consumes: `getBlink().organize` (Task 7), `noteKeys`, `getAutosave`
- Produces: `useOrganizePreview()`, `useOrganizeApply()`, `usePlaceNote()`, `useImportNotes()`, `<OrganizeDialog folder onClose />`, `note-queries`의 `notifyRelinked` export

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/renderer/features/organize/organize.flow.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizePlan } from '../../../shared/ipc/organize';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetAutosaveForTests } from '../notes/autosave/autosave';

const sidebarTree = () => within(screen.getByRole('region', { name: '노트 목록' }));
let plan: (folder: string) => OrganizePlan;

describe('organize flow', () => {
  beforeEach(() => {
    plan = (folder) => ({ folder, newFolders: [], moves: [], skipped: 'NO_CLEAR_GROUPS' });
    resetBlinkForTests({ organizePreview: (folder) => plan(folder) });
    resetAutosaveForTests();
    window.location.hash = '#/';
    localStorage.clear();
  });

  it('previews and applies a classification of the vault root', async () => {
    const a = await seedNote('spring boot 실무 1편');
    const b = await seedNote('spring boot 실무 2편');
    plan = (folder) => ({
      folder,
      newFolders: [{ name: 'Spring', notes: [a, b].map((n) => ({ id: n.id, title: n.title, from: '' })) }],
      moves: [],
      skipped: null,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '보관함 분류하기' }));
    const dialog = await screen.findByRole('dialog', { name: '분류하기 — 보관함 맨 위' });
    expect(await within(dialog).findByText('새 폴더 Spring')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '옮기기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await sidebarTree().findByRole('treeitem', { name: 'Spring' })).toBeInTheDocument();
  });

  it('tells the user when there is nothing to group', async () => {
    await seedNote('김치찌개 레시피');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '보관함 분류하기' }));
    expect(await screen.findByText('나눌 만한 묶음이 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '옮기기' })).toBeDisabled();
  });

  it('offers 분류하기 on folders but not on 미분류', async () => {
    await seedNote('a 노트', '', '공부');
    await seedNote('b 노트', '', '미분류');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await sidebarTree().findByRole('button', { name: '공부 폴더 메뉴' }));
    expect(screen.getByRole('menuitem', { name: '분류하기' })).toBeInTheDocument();
    await user.click(sidebarTree().getByRole('button', { name: '미분류 폴더 메뉴' }));
    expect(screen.queryByRole('menuitem', { name: '분류하기' })).not.toBeInTheDocument();
  });

  it('places a new note only when its first title is set', async () => {
    const place = vi.spyOn(getBlink().organize, 'place');
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: /새 노트/ }))[0]!);
    const title = await screen.findByRole('textbox', { name: '노트 제목' });
    await user.clear(title);
    await user.type(title, 'spring boot 실무 4편{Enter}');
    await waitFor(() => expect(place).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(title).toBeEnabled());
    await user.clear(title);
    await user.type(title, '다른 제목{Enter}');
    await waitFor(() => expect(title).toHaveValue('다른 제목'));
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('only accepts .md files when dropping', async () => {
    const importFile = vi.spyOn(getBlink().organize, 'importFile');
    render(<App />);
    const region = await screen.findByRole('region', { name: '노트 목록' });
    const files = [new File([''], '사진.png')];
    const dataTransfer = { types: ['Files'], files, getData: () => '' };

    fireEvent.dragOver(region, { dataTransfer });
    fireEvent.drop(region, { dataTransfer });

    expect(await screen.findByText('.md 파일만 넣을 수 있습니다')).toBeInTheDocument();
    expect(importFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/renderer/features/organize`
Expected: FAIL — `보관함 분류하기` 버튼을 찾지 못함

- [ ] **Step 3: `notifyRelinked` 공개** — `src/renderer/features/notes/api/note-queries.ts`에서

```ts
function notifyRelinked(noteIds: string[]): void {
```

를

```ts
export function notifyRelinked(noteIds: string[]): void {
```

로 바꾼다.

- [ ] **Step 4: 훅**

```ts
// src/renderer/features/organize/api/organize-queries.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrganizePlan } from '../../../../shared/ipc/organize';
import { getBlink } from '../../../shared/api/blink';
import { noteKeys, notifyRelinked } from '../../notes/api/note-queries';
import { getAutosave } from '../../notes/autosave/autosave';

/** 노트가 옮겨진 뒤: 트리·링크를 다시 읽고, 링크가 고쳐진 열린 노트에 알린다. */
function useAfterMoves() {
  const queryClient = useQueryClient();
  return (updatedNoteIds: string[]) => {
    void queryClient.invalidateQueries({ queryKey: noteKeys.links });
    void queryClient.invalidateQueries({ queryKey: noteKeys.tree });
    notifyRelinked(updatedNoteIds);
  };
}

export function useOrganizePreview() {
  return useMutation({ mutationFn: (folder: string) => getBlink().organize.preview({ folder }) });
}

/** 옮기면 다른 노트의 링크를 고쳐 쓴다 — 대기 중인 저장이 고친 파일을 옛 링크로 덮지 않도록 먼저 모두 저장한다. */
export function useOrganizeApply() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (plan: OrganizePlan) => {
      await getAutosave().flushAll();
      return getBlink().organize.apply(plan);
    },
    onSuccess: (result) => afterMoves(result.updatedNoteIds),
  });
}

export function usePlaceNote() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (id: string) => {
      await getAutosave().flushAll();
      return getBlink().organize.place({ id });
    },
    onSuccess: (result) => afterMoves(result.updatedNoteIds),
  });
}

/** 끌어다 놓은 `.md` 파일을 하나씩 가져온다 (각각 놓은 폴더부터 자동 배치). */
export function useImportNotes() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (input: { files: File[]; folder: string }) => {
      const blink = getBlink();
      const results = [];
      for (const file of input.files) {
        results.push(await blink.organize.importFile({ sourcePath: blink.organize.pathForFile(file), folder: input.folder }));
      }
      return results;
    },
    onSuccess: (results) => afterMoves(results.flatMap((r) => r.updatedNoteIds)),
  });
}
```

- [ ] **Step 5: 미리보기 대화상자**

```tsx
// src/renderer/features/organize/components/OrganizeDialog.tsx
import { useEffect, useRef } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { useOrganizeApply, useOrganizePreview } from '../api/organize-queries';

const ERRORS: Partial<Record<string, string>> = {
  AI_PROVIDER_NOT_CONFIGURED: '설정에서 AI를 먼저 연결해 주세요',
  AI_CAPABILITY_UNSUPPORTED: '지금 모델은 폴더 이름 짓기를 지원하지 않습니다',
  ORGANIZE_NAMING_FAILED: '폴더 이름을 짓지 못했습니다. 다시 시도해 주세요',
};
const SKIPPED = {
  TOO_FEW_NOTES: '분류하려면 노트가 3개 이상 있어야 합니다',
  NO_CLEAR_GROUPS: '나눌 만한 묶음이 없습니다',
} as const;

/** 분류하기: 열리자마자 미리보기를 만들고, «옮기기»를 누르면 그대로 옮긴다. */
export function OrganizeDialog({ folder, onClose }: { folder: string; onClose(): void }) {
  const preview = useOrganizePreview();
  const apply = useOrganizeApply();
  const started = useRef(false);
  const { mutate } = preview;

  useEffect(() => {
    // StrictMode에서 effect가 두 번 돌아도 AI를 두 번 부르지 않는다.
    if (started.current) return;
    started.current = true;
    mutate(folder);
  }, [mutate, folder]);

  const plan = preview.data;
  const empty = plan !== undefined && plan.newFolders.length === 0 && plan.moves.length === 0;
  const error = preview.error ?? apply.error;
  const errorText = error ? (error instanceof BlinkIpcError && ERRORS[error.code]) || '분류하지 못했습니다' : null;

  return (
    <Dialog
      title={`분류하기 — ${folder || '보관함 맨 위'}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!plan || empty || apply.isPending}
            onClick={() => plan && apply.mutate(plan, { onSuccess: onClose })}
          >
            옮기기
          </button>
        </>
      }
    >
      {preview.isPending && <p>분류하는 중…</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {plan && empty && <p>{SKIPPED[plan.skipped ?? 'NO_CLEAR_GROUPS']}</p>}
      {plan && !empty && (
        <ul aria-label="분류 미리보기">
          {plan.newFolders.map((group) => (
            <li key={`new:${group.name}`}>
              <strong>새 폴더 {group.name}</strong>
              <ul>
                {group.notes.map((note) => (
                  <li key={note.id}>{note.title}</li>
                ))}
              </ul>
            </li>
          ))}
          {plan.moves.map((move) => (
            <li key={`move:${move.id}`}>
              {move.title} → {move.to}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 6: 보관함 맨 위 «분류하기» 버튼** — `src/renderer/app/Sidebar.tsx`

import를 바꾼다:

```ts
import { FolderPlus, Plus, Search, Settings, Sparkles } from 'lucide-react';
```

import에 추가:

```ts
import { OrganizeDialog } from '../features/organize/components/OrganizeDialog';
```

`const [creatingFolder, setCreatingFolder] = useState(false);` 아래에 추가:

```ts
  const [organizingRoot, setOrganizingRoot] = useState(false);
```

`새 폴더` 버튼(`</button>` 닫힘) 바로 아래, `createRow`의 `</div>` 앞에 추가:

```tsx
        <button
          type="button"
          className="button-icon"
          aria-label="보관함 분류하기"
          title="보관함 분류하기"
          onClick={() => setOrganizingRoot(true)}
        >
          <Sparkles size={16} strokeWidth={1.75} />
        </button>
```

`{creatingFolder && (…)}` 블록 아래에 추가:

```tsx
      {organizingRoot && <OrganizeDialog folder="" onClose={() => setOrganizingRoot(false)} />}
```

- [ ] **Step 7: 폴더 메뉴 «분류하기»와 끌어다 놓기** — `src/renderer/features/notes/components/NoteTree.tsx`

import에 추가:

```ts
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { useImportNotes } from '../../organize/api/organize-queries';
import { OrganizeDialog } from '../../organize/components/OrganizeDialog';
```

파일 위쪽 상수 아래에 추가:

```ts
const UNSORTED = '미분류';
const IMPORT_ERRORS: Partial<Record<string, string>> = {
  NOTE_IMPORT_LOCKED: '파일이 다른 프로그램에서 열려 있습니다. 닫고 다시 넣어 주세요',
  NOTE_IMPORT_INVALID: '가져올 수 없는 파일입니다',
};
```

`NoteTree` 안 `const moveNote = useMoveNote();` 아래에 추가:

```ts
  const [organizing, setOrganizing] = useState<string | null>(null);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const importNotes = useImportNotes();
```

`dropProps`를 통째로 바꾼다 (노트 끌기 + 바깥 파일 놓기):

```ts
  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      const types = event.dataTransfer.types;
      if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget((current) => (current === folder ? null : current)),
    onDrop: (event: DragEvent) => {
      setDropTarget(null);
      const files = [...event.dataTransfer.files];
      if (files.length > 0) {
        // 바깥 파일: .md만 놓은 폴더로 가져와 자동 배치
        event.preventDefault();
        event.stopPropagation();
        const markdown = files.filter((file) => /\.md$/i.test(file.name));
        setDropMessage(markdown.length < files.length ? '.md 파일만 넣을 수 있습니다' : null);
        if (markdown.length > 0) importNotes.mutate({ files: markdown, folder });
        return;
      }
      const id = event.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      const note = tree?.notes.find((n) => n.id === id);
      if (note && note.folder !== folder) moveNote.mutate({ id, folder });
    },
  });
```

`renderFolder`의 `<FolderRow … onDialog={setDialog} />`에 prop 하나를 더한다:

```tsx
          onDialog={setDialog}
          onOrganize={() => setOrganizing(node.path)}
```

`NoteTree`가 반환하는 `<section>` 안, `{dialog && <FolderDialog … />}` 아래에 추가:

```tsx
      {organizing !== null && <OrganizeDialog folder={organizing} onClose={() => setOrganizing(null)} />}
      {dropMessage && (
        <p role="alert" className={styles.message}>
          {dropMessage}
        </p>
      )}
      {importNotes.isError && (
        <p role="alert" className={styles.message}>
          {(importNotes.error instanceof BlinkIpcError && IMPORT_ERRORS[importNotes.error.code]) || '파일을 가져오지 못했습니다'}
        </p>
      )}
```

`FolderRowProps`에 추가:

```ts
  onOrganize(): void;
```

`FolderRow`의 매개변수 구조 분해를 바꾼다:

```ts
function FolderRow({ node, depth, open, selected, dropping, dropProps, onClick, onDialog, onOrganize }: FolderRowProps) {
```

메뉴의 `새 폴더` 메뉴 항목 아래에 추가 (「미분류」 폴더에는 보이지 않는다):

```tsx
            {node.name !== UNSORTED && (
              <button type="button" role="menuitem" onClick={act(onOrganize)}>
                분류하기
              </button>
            )}
```

- [ ] **Step 8: 첫 제목 자동 배치** — `src/renderer/features/notes/components/TitleInput.tsx`

import에 추가:

```ts
import { usePlaceNote } from '../../organize/api/organize-queries';
```

`RENAME_ERRORS` 아래에 추가:

```ts
/** Blink가 새 노트에 붙이는 임시 제목 (`제목 없음`, `제목 없음 1` …) */
const PLACEHOLDER_TITLE = /^제목 없음( \d+)?$/;
```

`const rename = useRenameNote();` 아래에 추가:

```ts
  const place = usePlaceNote();
```

`onSuccess`를 바꾼다:

```ts
        onSuccess: (result) => {
          // 처음 제목을 붙인 순간 한 번만 자동 배치한다. 그 뒤 제목을 바꿔도 움직이지 않는다.
          if (PLACEHOLDER_TITLE.test(committed) && !PLACEHOLDER_TITLE.test(result.note.title)) place.mutate(noteId);
          setCommitted(result.note.title);
          setDraft(result.note.title);
          setError(null);
        },
```

- [ ] **Step 9: 통과 확인**

Run: `pnpm vitest run src/renderer && pnpm typecheck`
Expected: PASS (새 테스트 5개 + 기존 renderer 테스트 전부), typecheck 오류 0

- [ ] **Step 10: Commit**

```bash
git add src/renderer/features/organize src/renderer/features/notes/api/note-queries.ts src/renderer/features/notes/components/NoteTree.tsx src/renderer/features/notes/components/TitleInput.tsx src/renderer/app/Sidebar.tsx
git commit -m "feat: classify folders from the sidebar, auto-place first titles and import dropped markdown"
```

---

### Task 9: 전체 확인 · 직접 돌려 보기

**Files:** 없음 (확인만)

- [ ] **Step 1: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: 전부 PASS, 오류 0

- [ ] **Step 2: API Key 없이 가짜 AI로 실행** (PowerShell)

Run: `$env:BLINK_FAKE_LLM='1'; pnpm dev`

확인할 것 (하나라도 다르면 멈추고 알린다):
1. 새 빈 폴더를 보관함으로 연다.
2. 노트 6개를 만들어 제목을 `spring boot 실무 1편`·`2편`·`3편`, `rust 소유권 정리`·`활용`·`심화`로 붙인다. 폴더가 없으니 전부 맨 위에 그대로 있다.
3. 사이드바의 «보관함 분류하기»(반짝이 아이콘)를 누른다 → 미리보기에 «새 폴더 묶음1», «새 폴더 묶음2»와 각 3개 노트가 보인다 → «옮기기» → 폴더 2개가 생기고 노트가 들어간다.
4. 폴더 이름을 `Spring`, `Rust`로 바꾼다 (폴더 메뉴 → 이름 바꾸기).
5. 맨 위에서 새 노트를 만들고 제목을 `spring boot 실무 4편`으로 붙인다 → `Spring` 폴더로 옮겨진다. 제목을 다시 바꾸면 움직이지 않는다.
6. 새 노트 제목을 `김치찌개 레시피`로 붙인다 → 맨 위에 `미분류` 폴더가 생기고 그리로 간다. `미분류` 폴더 메뉴에는 «분류하기»가 없다.
7. 탐색기에서 `.md` 파일 하나를 사이드바로 끌어다 놓는다 → 원래 자리에서 사라지고 맞는 폴더(없으면 `미분류`)에 들어간다. `.png`를 놓으면 «.md 파일만 넣을 수 있습니다».

- [ ] **Step 3: 실제 AI로 한 번** — 설정에서 OpenAI `gpt-5.4-mini`와 API Key를 넣고 Step 2의 3번을 다시 한다 → 폴더 이름이 «Spring», «Rust»처럼 1층 예시 넓이로 나오는지 본다. 이 한 번에 AI 호출 1번(몇 원 수준)이 나간다.
