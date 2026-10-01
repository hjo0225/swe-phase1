import { distanceToCenter, type Similarity } from './similarity';

export interface FolderShape {
  path: string;
  /** 이 폴더(하위 포함) 노트들의 유사도 표 번호 */
  members: number[];
  /** 미리 구한 반경. 같은 폴더에 여러 노트를 견줄 때 한 번만 구하려고 둔다 (없으면 그때 계산) */
  radius?: number;
}

/**
 * 폴더 반경: 기존 노트마다 «자기를 뺀 나머지 노트들의 대표 위치»까지 거리를 재서 가장 먼 값.
 * 자기를 빼는 이유: 자기가 대표 위치 계산에 들어가 있으면 거리가 작게 나와서, 비슷한 제목(«4편»)도 밖으로 밀려난다.
 * 노트가 1개면 비교할 나머지가 없어 반경 0.
 * 노트마다 나머지 평균을 새로 구하면 노트 수의 세제곱만큼 느려서, 행 합 r과 전체 합 T로 바로 계산한다:
 * 거리² = s(m,m) − 2(r − s(m,m))/(n−1) + (T − 2r + s(m,m))/(n−1)²
 */
export function folderRadius(sim: Similarity, members: readonly number[]): number {
  const n = members.length;
  if (n < 2) return 0;
  const rows = members.map((m) => members.reduce((sum, j) => sum + sim[m]![j]!, 0));
  const total = rows.reduce((sum, r) => sum + r, 0);
  let radius = 0;
  members.forEach((m, k) => {
    const self = sim[m]![m]!;
    const row = rows[k]!;
    const d2 = self - (2 * (row - self)) / (n - 1) + (total - 2 * row + self) / (n - 1) ** 2;
    radius = Math.max(radius, Math.sqrt(Math.max(0, d2)));
  });
  return radius;
}

/** 반경 안에 들어오는 폴더 중 대표 위치가 가장 가까운 폴더. 없으면 null. */
export function fittingFolder(sim: Similarity, note: number, folders: readonly FolderShape[]): string | null {
  let best: { path: string; distance: number } | null = null;
  for (const folder of folders) {
    if (folder.members.length === 0) continue;
    const d = distanceToCenter(sim, note, folder.members);
    const radius = folder.radius ?? folderRadius(sim, folder.members);
    if (d <= radius && (!best || d < best.distance)) best = { path: folder.path, distance: d };
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
