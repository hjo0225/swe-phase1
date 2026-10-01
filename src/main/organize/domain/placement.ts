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
