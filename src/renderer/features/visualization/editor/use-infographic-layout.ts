import { useEffect, useMemo, useState } from 'react';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutArchitectureBase, placeArchitecture, type ArchitectureBase } from '../renderers/architecture-layout';
import { layoutInfographic, type InfographicLayout } from '../renderers/layout';

/**
 * 4유형은 바로(동기) 계산한다. architecture는 ELK가 비동기라 구조가 바뀔 때만 다시 배치하고,
 * 카드 끌기(positions)는 그 결과 위에 동기로 덮어쓴다 — 끄는 동안 ELK를 다시 돌리지 않는다.
 * 배치 중이면 layout이 null, 배치에 실패하면 failed가 true다.
 */
export function useInfographicLayout(spec: InfographicSpec | null): { layout: InfographicLayout | null; failed: boolean } {
  // positions를 뺀 나머지가 같으면 같은 구조다
  const structureKey = spec?.type === 'architecture' ? JSON.stringify({ ...spec, positions: undefined }) : null;
  const [base, setBase] = useState<{ key: string; base: ArchitectureBase | null } | null>(null);

  useEffect(() => {
    if (!spec || !structureKey) return;
    let cancelled = false;
    layoutArchitectureBase(spec).then(
      (result) => {
        if (!cancelled) setBase({ key: structureKey, base: result });
      },
      () => {
        if (!cancelled) setBase({ key: structureKey, base: null });
      },
    );
    return () => {
      cancelled = true;
    };
    // structureKey가 spec의 구조를 대표한다 (positions 변화로는 다시 배치하지 않는다)
  }, [structureKey]);

  return useMemo(() => {
    if (!spec) return { layout: null, failed: false };
    if (spec.type !== 'architecture') return { layout: layoutInfographic(spec), failed: false };
    // 구조가 바뀐 직후에는 옛 배치를 쓰지 않는다 (없는 카드·그룹을 가리킬 수 있다)
    if (!base || base.key !== structureKey) return { layout: null, failed: false };
    return base.base ? { layout: placeArchitecture(base.base, spec), failed: false } : { layout: null, failed: true };
  }, [spec, base, structureKey]);
}
