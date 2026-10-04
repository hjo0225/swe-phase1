import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutArchitectureBase, placeArchitecture, type ArchitectureBase } from '../renderers/architecture-layout';
import { layoutInfographic, type InfographicLayout } from '../renderers/layout';

/**
 * 4유형은 바로(동기) 계산한다. architecture는 ELK가 비동기라 구조가 바뀔 때만 다시 배치하고,
 * 카드 끌기(positions)는 그 결과 위에 동기로 덮어쓴다 — 끄는 동안 ELK를 다시 돌리지 않는다.
 * 배치 중이면 layout이 null, 배치에 실패하면 failed가 true다.
 * place는 같은 구조의 다른 positions로 그릴 자리를 바로 계산한다 (놓은 카드를 그려질 자리 그대로 저장할 때).
 */
export function useInfographicLayout(spec: InfographicSpec | null): {
  layout: InfographicLayout | null;
  failed: boolean;
  place: (spec: InfographicSpec) => InfographicLayout | null;
} {
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

  // 구조가 바뀐 직후에는 옛 배치를 쓰지 않는다 (없는 카드·그룹을 가리킬 수 있다)
  const current = base && base.key === structureKey ? base : null;
  const place = useCallback(
    (s: InfographicSpec): InfographicLayout | null => {
      if (s.type !== 'architecture') return layoutInfographic(s);
      return current?.base ? placeArchitecture(current.base, s) : null;
    },
    [current],
  );

  return useMemo(() => {
    if (!spec) return { layout: null, failed: false, place };
    return { layout: place(spec), failed: spec.type === 'architecture' && current !== null && current.base === null, place };
  }, [spec, current, place]);
}
