import { describe, expect, it } from 'vitest';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { layoutInfographic, wrapText } from './layout';
import { infographicTheme as t } from '../theme/infographic-theme';

const process = (count: number): InfographicSpec => ({
  version: 1,
  type: 'process',
  title: '과정',
  nodes: Array.from({ length: count }, (_, i) => ({ id: String(i + 1), title: `단계 ${i + 1}`, description: '설명' })),
  edges: Array.from({ length: count - 1 }, (_, i) => [String(i + 1), String(i + 2)] as [string, string]),
});

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('wrapText', () => {
  it('breaks on spaces within the budget and hard-breaks long words', () => {
    expect(wrapText('가'.repeat(30), 12)).toEqual(['가'.repeat(12), '가'.repeat(12), '가'.repeat(6)]);
    expect(wrapText('', 10)).toEqual([]);
  });

  it('measures Latin letters narrower than Hangul so English words are not split early', () => {
    // 예산은 한글 글자 수 기준. 영문은 한글의 절반 남짓 폭이다.
    expect(wrapText('contextBridge', 12)).toEqual(['contextBridge']);
    expect(wrapText('Main Process와 Renderer Process', 14)).toEqual(['Main Process와 Renderer', 'Process']);
    expect(wrapText('a'.repeat(40), 12)).toEqual(['a'.repeat(21), 'a'.repeat(19)]);
  });
});

describe('layoutInfographic — process', () => {
  it('places up to four steps left to right on one row and marks the start', () => {
    const layout = layoutInfographic(process(3));
    const [a, b, c] = layout.nodes;
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(1);
    expect(layout.nodes.map((n) => n.emphasis)).toEqual([true, false, false]);
    expect(layout.edges).toHaveLength(2);
  });

  it('wraps longer processes onto more rows without overlapping cards', () => {
    const layout = layoutInfographic(process(6));
    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(2);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect(overlaps(layout.nodes[i]!, layout.nodes[j]!)).toBe(false);
      }
    }
  });

  it('fits every card inside the canvas', () => {
    const layout = layoutInfographic(process(6));
    for (const n of layout.nodes) {
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe('layoutInfographic — moved cards', () => {
  const endOf = (path: string) => path.split(' ').slice(-2).map(Number);
  const startOf = (path: string) => path.split(' ').slice(1, 3).map(Number);

  it('draws a moved card where it was dropped and leaves the others in place', () => {
    const before = layoutInfographic(process(3));
    const after = layoutInfographic({ ...process(3), positions: { '3': { x: 900, y: 400 } } });
    expect(after.nodes[2]).toMatchObject({ x: 900, y: 400 });
    expect(after.nodes.slice(0, 2)).toEqual(before.nodes.slice(0, 2));
  });

  it('reconnects the lines to where the cards are, so moving a card closer shortens its line', () => {
    const before = layoutInfographic(process(2));
    const [a, b] = before.nodes;
    // 둘째 카드를 첫째 카드 바로 옆(간격 16)으로 당긴다
    const after = layoutInfographic({ ...process(2), positions: { '2': { x: a!.x + a!.width + 16, y: b!.y } } });
    const lengthOf = (path: string) => endOf(path)[0]! - startOf(path)[0]!;
    expect(lengthOf(after.edges[0]!.path)).toBe(16);
    expect(lengthOf(after.edges[0]!.path)).toBeLessThan(lengthOf(before.edges[0]!.path));
    expect(after.edges[0]!.end).toEqual({ x: a!.x + a!.width + 16, y: b!.y + b!.height / 2 });
  });

  it('joins top and bottom edges when a card is dragged below the other', () => {
    const [a] = layoutInfographic(process(2)).nodes;
    const after = layoutInfographic({ ...process(2), positions: { '2': { x: a!.x, y: a!.y + a!.height + 80 } } });
    expect(startOf(after.edges[0]!.path)).toEqual([a!.x + a!.width / 2, a!.y + a!.height]);
    expect(after.edges[0]!.end).toEqual({ x: a!.x + a!.width / 2, y: a!.y + a!.height + 80 });
  });

  it('grows the canvas to hold a card dragged past the edge and keeps cards out of the title area', () => {
    const after = layoutInfographic({ ...process(2), positions: { '2': { x: 1500, y: 700 }, '1': { x: -50, y: -50 } } });
    const [a, b] = after.nodes;
    expect(after.width).toBe(1500 + b!.width + t.spacing.margin);
    expect(after.height).toBe(700 + b!.height + t.spacing.margin);
    expect([a!.x, a!.y]).toEqual([t.spacing.margin, t.spacing.header]);
  });

  it('stretches a comparison column background around its cards after one is moved', () => {
    const spec: InfographicSpec = {
      version: 1,
      type: 'comparison',
      title: 'A vs B',
      nodes: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'a1', title: 'a1' },
        { id: 'b1', title: 'b1' },
      ],
      edges: [
        ['a', 'a1'],
        ['b', 'b1'],
      ],
      positions: { a1: { x: 40, y: 600 } },
    };
    const layout = layoutInfographic(spec);
    const a1 = layout.nodes.find((n) => n.id === 'a1')!;
    const panel = layout.panels[0]!;
    expect(panel.y + panel.height).toBe(a1.y + a1.height + t.spacing.panelPadding);
    expect(panel.x).toBeLessThanOrEqual(a1.x - t.spacing.panelPadding);
  });
});

describe('layoutInfographic — hierarchy', () => {
  const spec: InfographicSpec = {
    version: 1,
    type: 'hierarchy',
    title: '구성',
    nodes: [
      { id: 'r', title: 'Electron' },
      { id: 'm', title: 'Main' },
      { id: 'p', title: 'Renderer' },
      { id: 'x', title: 'Preload' },
    ],
    edges: [
      ['r', 'm'],
      ['r', 'p'],
      ['m', 'x'],
    ],
  };

  it('puts children one level below their parent and centers the root over its children', () => {
    const layout = layoutInfographic(spec);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const [root, main, renderer, preload] = ['r', 'm', 'p', 'x'].map((id) => byId.get(id)!);
    expect(main!.y).toBeGreaterThan(root!.y);
    expect(renderer!.y).toBe(main!.y);
    expect(preload!.y).toBeGreaterThan(main!.y);
    const center = (n: typeof root) => n!.x + n!.width / 2;
    expect(center(root)).toBeCloseTo((center(main) + center(renderer)) / 2);
    expect(root!.emphasis).toBe(true);
    expect(overlaps(main!, renderer!)).toBe(false);
  });
});

const noOverlap = (nodes: { x: number; y: number; width: number; height: number }[]) => {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) expect(overlaps(nodes[i]!, nodes[j]!)).toBe(false);
  }
};
const inside = (layout: ReturnType<typeof layoutInfographic>) => {
  for (const n of layout.nodes) {
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
    expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
  }
};

describe('layoutInfographic — comparison', () => {
  const spec: InfographicSpec = {
    version: 1,
    type: 'comparison',
    title: 'OpenAI vs Kimi',
    nodes: [
      { id: 'o', title: 'OpenAI' },
      { id: 'k', title: 'Kimi' },
      { id: 'o1', title: '웹 검색 내장', description: 'Responses API 도구로 검색하고 인용을 돌려준다' },
      { id: 'o2', title: 'JSON Schema' },
      { id: 'k1', title: '검색 API' },
      { id: 'k2', title: 'JSON Schema' },
    ],
    edges: [
      ['o', 'o1'],
      ['o', 'o2'],
      ['k', 'k1'],
      ['k', 'k2'],
    ],
  };

  it('puts each compared item on top of its own column and aligns features row by row', () => {
    const layout = layoutInfographic(spec);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const [o, k, o1, o2, k1, k2] = ['o', 'k', 'o1', 'o2', 'k1', 'k2'].map((id) => byId.get(id)!);
    expect(o!.y).toBe(k!.y);
    expect(o!.x).toBeLessThan(k!.x);
    expect([o1!.x, o2!.x]).toEqual([o!.x, o!.x]);
    expect([k1!.x, k2!.x]).toEqual([k!.x, k!.x]);
    expect(o1!.y).toBe(k1!.y);
    expect(o2!.y).toBe(k2!.y); // o1이 더 길어도 둘째 줄은 나란히
    expect(o1!.y).toBeGreaterThan(o!.y);
    expect([o!.emphasis, k!.emphasis, o1!.emphasis]).toEqual([true, true, false]);
    expect(layout.edges).toEqual([]); // 연결선 대신 열 배경으로 묶는다
    expect(layout.panels).toHaveLength(2);
    noOverlap(layout.nodes);
    inside(layout);
  });
});

describe('layoutInfographic — mindmap', () => {
  const spec: InfographicSpec = {
    version: 1,
    type: 'mindmap',
    title: 'Blink',
    nodes: [
      { id: 'c', title: 'Blink' },
      { id: 'a', title: '노트' },
      { id: 'b', title: 'AI' },
      { id: 'd', title: '검색' },
      { id: 'e', title: '설정' },
      { id: 'a1', title: '자동 저장' },
      { id: 'a2', title: '폴더' },
      { id: 'b1', title: '정리' },
      { id: 'e1', title: 'API Key' },
    ],
    edges: [
      ['c', 'a'],
      ['c', 'b'],
      ['c', 'd'],
      ['c', 'e'],
      ['a', 'a1'],
      ['a', 'a2'],
      ['b', 'b1'],
      ['e', 'e1'],
    ],
  };

  it('puts the center in the middle, topics on both sides and details on the outside', () => {
    const layout = layoutInfographic(spec);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => byId.get(id)!.x + byId.get(id)!.width / 2;
    const center = mid('c');
    const right = ['a', 'b'];
    const left = ['d', 'e'];
    for (const id of right) expect(mid(id)).toBeGreaterThan(center);
    for (const id of left) expect(mid(id)).toBeLessThan(center);
    expect(mid('a1')).toBeGreaterThan(mid('a'));
    expect(mid('e1')).toBeLessThan(mid('e'));
    expect(byId.get('c')!.emphasis).toBe(true);
    expect(layout.edges).toHaveLength(8);
    // 중심에서 오른쪽 주제로 가는 선은 중심의 오른쪽 변에서 나간다
    const toA = layout.edges.find((e) => e.from === 'c' && e.to === 'a')!;
    expect(toA.path.startsWith(`M ${byId.get('c')!.x + byId.get('c')!.width} `)).toBe(true);
    noOverlap(layout.nodes);
    inside(layout);
  });

  it('keeps a one-topic map on a single side', () => {
    const layout = layoutInfographic({
      version: 1,
      type: 'mindmap',
      title: 'x',
      nodes: [
        { id: 'c', title: '중심' },
        { id: 't', title: '주제' },
      ],
      edges: [['c', 't']],
    });
    const [c, t] = layout.nodes;
    expect(t!.x).toBeGreaterThan(c!.x);
    expect(c!.x).toBe(32);
    inside(layout);
  });
});
