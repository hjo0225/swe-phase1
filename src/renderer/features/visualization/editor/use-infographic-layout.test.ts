// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInfographicSpec, type InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutArchitectureBase } from '../renderers/architecture-layout';
import { infographicTheme as t } from '../theme/infographic-theme';
import { useInfographicLayout } from './use-infographic-layout';

vi.mock('../renderers/architecture-layout', async (importOriginal) => {
  const original = await importOriginal<typeof import('../renderers/architecture-layout')>();
  return { ...original, layoutArchitectureBase: vi.fn(original.layoutArchitectureBase) };
});
const elk = vi.mocked(layoutArchitectureBase);

const architecture = parseInfographicSpec({
  version: 1,
  type: 'architecture',
  title: 'Web service',
  groups: [{ id: 'vpc', title: 'VPC A' }],
  nodes: [
    { id: 'u', title: 'Users', icon: 'user' },
    { id: 'w', title: 'Web', icon: 'server', group: 'vpc' },
  ],
  edges: [['u', 'w', { label: 'HTTPS' }]],
});

describe('useInfographicLayout', () => {
  beforeEach(() => {
    elk.mockClear();
  });

  it('lays out the four existing types right away without ELK', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'process',
      title: '과정',
      nodes: [
        { id: '1', title: '입력' },
        { id: '2', title: '결과' },
      ],
      edges: [['1', '2']],
    };
    const { result } = renderHook(() => useInfographicLayout(spec));
    expect(result.current.layout?.nodes).toHaveLength(2);
    expect(result.current.failed).toBe(false);
    expect(elk).not.toHaveBeenCalled();
  });

  it('has no layout for no spec', () => {
    const { result } = renderHook(() => useInfographicLayout(null));
    expect(result.current).toMatchObject({ layout: null, failed: false });
  });

  it('runs ELK once per structure and moves dragged cards without running it again', async () => {
    const { result, rerender } = renderHook(({ spec }) => useInfographicLayout(spec), { initialProps: { spec: architecture } });
    expect(result.current).toMatchObject({ layout: null, failed: false }); // 배치 중
    await waitFor(() => expect(result.current.layout).not.toBeNull(), { timeout: 5000 }); // 처음엔 ELK(약 1.6MB)를 불러온다
    expect(result.current.layout!.groups).toHaveLength(1);

    rerender({ spec: { ...architecture, positions: { w: { x: 400, y: 300 } } } });
    const web = result.current.layout!.nodes.find((n) => n.id === 'w')!;
    expect({ x: web.x, y: web.y }).toEqual({ x: 400, y: 300 });
    rerender({ spec: { ...architecture, positions: { w: { x: 420, y: 320 } } } });
    expect(result.current.layout!.nodes.find((n) => n.id === 'w')!.x).toBe(420);
    // place: 다른 자리로 그려 보기 — 그룹 안 카드는 그룹 이름 자리 아래로만 간다
    const placed = result.current.place({ ...architecture, positions: { w: { x: 0, y: 0 } } })!;
    expect(placed.nodes.find((n) => n.id === 'w')!.y).toBe(t.spacing.header + t.architecture.group.header);
    expect(elk).toHaveBeenCalledTimes(1);

    // 구조가 바뀌면 다시 배치한다 — 그동안 옛 배치를 보여 주지 않는다
    rerender({ spec: { ...architecture, title: 'Renamed' } });
    expect(result.current.layout).toBeNull();
    await waitFor(() => expect(result.current.layout?.title).toBe('Renamed'), { timeout: 5000 });
    expect(elk).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('reports a failed layout', async () => {
    elk.mockRejectedValueOnce(new Error('elk failed'));
    const { result } = renderHook(() => useInfographicLayout(architecture));
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 5000 });
    expect(result.current.layout).toBeNull();
  });
});
