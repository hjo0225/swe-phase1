import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_ICONS,
  InfographicSpecError,
  infographicJsonSchema,
  isLayerStack,
  looseNodes,
  parseInfographicSpec,
} from './infographic-spec';

const node = (id: string, title = `노드 ${id}`, description?: string) => ({ id, title, ...(description ? { description } : {}) });
const base = (overrides: Record<string, unknown>) => ({
  version: 1,
  type: 'process',
  title: '처리 과정',
  nodes: [node('1'), node('2'), node('3')],
  edges: [
    ['1', '2'],
    ['2', '3'],
  ],
  ...overrides,
});
const reason = (raw: unknown) => {
  try {
    parseInfographicSpec(raw);
    return 'ok';
  } catch (error) {
    expect(error).toBeInstanceOf(InfographicSpecError);
    return (error as InfographicSpecError).reason;
  }
};

describe('parseInfographicSpec — common rules', () => {
  it('accepts a valid process and normalizes strings and duplicate edges', () => {
    const spec = parseInfographicSpec(
      base({
        title: '  처리 과정  ',
        nodes: [node('1', ' 작성 ', ' 설명 '), node('2'), node('3')],
        edges: [
          ['1', '2'],
          ['1', '2'],
          ['2', '3'],
        ],
      }),
    );
    expect(spec.title).toBe('처리 과정');
    expect(spec.nodes[0]).toEqual({ id: '1', title: '작성', description: '설명' });
    expect(spec.edges).toEqual([
      ['1', '2'],
      ['2', '3'],
    ]);
  });

  it('drops empty descriptions', () => {
    const spec = parseInfographicSpec(base({ nodes: [node('1', 'a', '  '), node('2'), node('3')] }));
    expect(spec.nodes[0]).toEqual({ id: '1', title: 'a' });
  });

  it('rejects malformed shapes and unsupported types', () => {
    expect(reason('nope')).toBe('SHAPE');
    expect(reason(base({ version: 2 }))).toBe('SHAPE');
    expect(reason(base({ type: 'timeline' }))).toBe('UNSUPPORTED_TYPE');
  });

  it('enforces length and count limits', () => {
    expect(reason(base({ title: '' }))).toBe('SHAPE');
    expect(reason(base({ title: 'x'.repeat(61) }))).toBe('SHAPE');
    expect(reason(base({ nodes: [node('1')], edges: [] }))).toBe('NODE_COUNT');
    expect(reason(base({ nodes: Array.from({ length: 17 }, (_, i) => node(String(i))), edges: [] }))).toBe('NODE_COUNT');
    expect(reason(base({ nodes: [node('1', 'x'.repeat(41)), node('2'), node('3')] }))).toBe('SHAPE');
  });

  it('rejects duplicate ids, dangling edges and self edges', () => {
    expect(reason(base({ nodes: [node('1'), node('1'), node('3')] }))).toBe('DUPLICATE_ID');
    expect(reason(base({ edges: [['1', '9']] }))).toBe('DANGLING_EDGE');
    expect(reason(base({ edges: [['1', '1']] }))).toBe('SELF_EDGE');
  });
});

describe('parseInfographicSpec — moved cards', () => {
  it('keeps the positions people dragged cards to, rounded to whole pixels', () => {
    const spec = parseInfographicSpec(base({ positions: { '2': { x: 300.4, y: 120.6 } } }));
    expect(spec.positions).toEqual({ '2': { x: 300, y: 121 } });
  });

  it('drops positions of unknown cards and leaves positions out when there are none', () => {
    expect(parseInfographicSpec(base({ positions: { '9': { x: 1, y: 2 } } }))).not.toHaveProperty('positions');
    expect(parseInfographicSpec(base({}))).not.toHaveProperty('positions');
  });

  it('rejects positions that are not finite numbers', () => {
    expect(reason(base({ positions: { '2': { x: 'left', y: 0 } } }))).toBe('SHAPE');
    expect(reason(base({ positions: { '2': { x: Number.POSITIVE_INFINITY, y: 0 } } }))).toBe('SHAPE');
  });
});

describe('parseInfographicSpec — process', () => {
  it('chains nodes in order when edges are empty', () => {
    expect(parseInfographicSpec(base({ edges: [] })).edges).toEqual([
      ['1', '2'],
      ['2', '3'],
    ]);
  });

  it('requires a single path through every node', () => {
    expect(reason(base({ edges: [['1', '2']] }))).toBe('STRUCTURE'); // 3이 빠짐
    expect(
      reason(
        base({
          edges: [
            ['1', '2'],
            ['1', '3'],
          ],
        }),
      ),
    ).toBe('STRUCTURE'); // 갈라짐
    expect(
      reason(
        base({
          edges: [
            ['1', '2'],
            ['2', '3'],
            ['3', '1'],
          ],
        }),
      ),
    ).toBe('STRUCTURE'); // 순환
  });
});

describe('parseInfographicSpec — hierarchy', () => {
  const tree = (edges: [string, string][], ids = ['a', 'b', 'c', 'd']) =>
    base({ type: 'hierarchy', nodes: ids.map((id) => node(id)), edges });

  it('accepts a tree with a single root', () => {
    const spec = parseInfographicSpec(
      tree([
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
      ]),
    );
    expect(spec.type).toBe('hierarchy');
  });

  it('rejects multiple roots, multiple parents and disconnected nodes', () => {
    expect(reason(tree([['a', 'b']], ['a', 'b', 'c']))).toBe('STRUCTURE'); // c 고립 = 루트 2개
    expect(
      reason(
        tree([
          ['a', 'b'],
          ['a', 'c'],
          ['b', 'd'],
          ['c', 'd'],
        ]),
      ),
    ).toBe('STRUCTURE'); // d의 부모 2개
  });
});

describe('parseInfographicSpec — comparison', () => {
  const compare = (edges: [string, string][], ids = ['a', 'b', 'a1', 'a2', 'b1', 'b2']) =>
    base({ type: 'comparison', nodes: ids.map((id) => node(id)), edges });

  it('accepts 2-3 compared items, each with its own features', () => {
    const spec = parseInfographicSpec(
      compare([
        ['a', 'a1'],
        ['a', 'a2'],
        ['b', 'b1'],
        ['b', 'b2'],
      ]),
    );
    expect(spec.type).toBe('comparison');
  });

  it('copies a feature shared by several items under each of them (LLMs link common traits once)', () => {
    const spec = parseInfographicSpec(
      compare(
        [
          ['a', 'a1'],
          ['b', 'b1'],
          ['a', 'both'],
          ['b', 'both'],
        ],
        ['a', 'b', 'a1', 'b1', 'both'],
      ),
    );
    const titleOf = new Map(spec.nodes.map((n) => [n.id, n.title]));
    const featuresOf = (item: string) => spec.edges.filter(([from]) => from === item).map(([, to]) => titleOf.get(to));
    expect(featuresOf('a')).toEqual(['노드 a1', '노드 both']);
    expect(featuresOf('b')).toEqual(['노드 b1', '노드 both']);
    expect(new Set(spec.edges.map(([, to]) => to)).size).toBe(spec.edges.length); // 특징마다 부모 하나
    expect(parseInfographicSpec(spec)).toEqual(spec); // 다시 적용해도 같다
  });

  it('rejects one or four items, items without features, and nested features', () => {
    expect(reason(compare([['a', 'a1']], ['a', 'a1']))).toBe('STRUCTURE'); // 비교 대상 1개
    expect(
      reason(
        compare(
          [
            ['a', 'a1'],
            ['b', 'b1'],
            ['c', 'c1'],
            ['d', 'd1'],
          ],
          ['a', 'b', 'c', 'd', 'a1', 'b1', 'c1', 'd1'],
        ),
      ),
    ).toBe('STRUCTURE'); // 4개
    expect(reason(compare([['a', 'a1']], ['a', 'b', 'a1']))).toBe('STRUCTURE'); // b에 특징 없음
    expect(
      reason(
        compare(
          [
            ['a', 'a1'],
            ['a1', 'a2'],
            ['b', 'b1'],
          ],
          ['a', 'b', 'a1', 'a2', 'b1'],
        ),
      ),
    ).toBe('STRUCTURE'); // 특징 아래 특징
  });
});

describe('parseInfographicSpec — mindmap', () => {
  const map = (edges: [string, string][], ids: string[]) =>
    base({ type: 'mindmap', nodes: ids.map((id) => node(id)), edges });

  it('accepts a center with topics and details (depth 2)', () => {
    const spec = parseInfographicSpec(
      map(
        [
          ['c', 't1'],
          ['c', 't2'],
          ['t1', 'd1'],
        ],
        ['c', 't1', 't2', 'd1'],
      ),
    );
    expect(spec.type).toBe('mindmap');
  });

  it('rejects branches deeper than center → topic → detail', () => {
    expect(
      reason(
        map(
          [
            ['c', 't'],
            ['t', 'd'],
            ['d', 'x'],
          ],
          ['c', 't', 'd', 'x'],
        ),
      ),
    ).toBe('STRUCTURE');
  });
});

describe('infographicJsonSchema', () => {
  it('describes a strict object with object edges for structured output', () => {
    const schema = infographicJsonSchema();
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['version', 'type', 'title', 'groups', 'nodes', 'edges'],
      properties: {
        type: { enum: ['process', 'hierarchy', 'comparison', 'mindmap', 'architecture'] },
        edges: { type: 'array', items: { type: 'object', required: ['from', 'to', 'label', 'bidirectional'] } },
      },
    });
  });
});

describe('parseInfographicSpec — architecture', () => {
  const arch = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    type: 'architecture',
    title: 'Multi zone web service',
    groups: [
      { id: 'vpc', title: 'VPC A' },
      { id: 'za', title: 'Zone A', parent: 'vpc' },
      { id: 'zb', title: 'Zone B', parent: 'vpc' },
    ],
    nodes: [
      { id: 'u', title: 'Users', icon: 'user' },
      { id: 'lb', title: 'Load Balancer', icon: 'load-balancer', group: 'vpc' },
      { id: 'w1', title: 'Web 1', icon: 'server', group: 'za' },
      { id: 'w2', title: 'Web 2', icon: 'server', group: 'zb' },
      { id: 'db', title: 'Cloud DB', icon: 'database', group: 'vpc' },
    ],
    edges: [
      ['u', 'lb', { label: 'HTTPS' }],
      ['lb', 'w1'],
      ['lb', 'w2'],
      ['w1', 'db', { bidirectional: true }],
      ['w2', 'db', { bidirectional: true }],
    ],
    ...overrides,
  });

  it('keeps groups, icons, edge labels and directions; lets several lines meet at one node', () => {
    const spec = parseInfographicSpec(arch());
    expect(spec.groups).toEqual([
      { id: 'vpc', title: 'VPC A' },
      { id: 'za', title: 'Zone A', parent: 'vpc' },
      { id: 'zb', title: 'Zone B', parent: 'vpc' },
    ]);
    expect(spec.nodes[1]).toEqual({ id: 'lb', title: 'Load Balancer', icon: 'load-balancer', group: 'vpc' });
    expect(spec.edges[0]).toEqual(['u', 'lb', { label: 'HTTPS' }]);
    expect(spec.edges[3]).toEqual(['w1', 'db', { bidirectional: true }]);
    expect(parseInfographicSpec(spec)).toEqual(spec); // 다시 적용해도 같다
  });

  it('drops unknown icons, empty labels and groups with nothing inside', () => {
    const spec = parseInfographicSpec(
      arch({
        groups: [
          { id: 'vpc', title: 'VPC A' },
          { id: 'empty', title: 'Unused', parent: 'vpc' },
        ],
        nodes: [
          { id: 'u', title: 'Users', icon: 'robot-arm' },
          { id: 'db', title: 'DB', icon: 'database', group: 'vpc' },
        ],
        edges: [['u', 'db', { label: '  ' }]],
      }),
    );
    expect(spec.nodes[0]).toEqual({ id: 'u', title: 'Users' });
    expect(spec.edges).toEqual([['u', 'db']]);
    expect(spec.groups).toEqual([{ id: 'vpc', title: 'VPC A' }]);
  });

  it('allows up to 30 nodes for architecture but still 16 for other types', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, title: `N${i}` }));
    const chain = (n: number) => Array.from({ length: n - 1 }, (_, i) => [`n${i}`, `n${i + 1}`]);
    expect(reason(arch({ groups: [], nodes: many(30), edges: chain(30) }))).toBe('ok');
    expect(reason(arch({ groups: [], nodes: many(31), edges: chain(31) }))).toBe('NODE_COUNT');
    expect(reason(base({ nodes: many(17), edges: chain(17) }))).toBe('NODE_COUNT');
  });

  it('rejects unknown parents, unknown node groups, cycles, depth over 3 and ids shared by a node and a group', () => {
    expect(reason(arch({ groups: [{ id: 'za', title: 'Zone', parent: 'nope' }] }))).toBe('STRUCTURE');
    expect(
      reason(
        arch({
          nodes: [
            { id: 'u', title: 'U', group: 'nope' },
            { id: 'v', title: 'V' },
          ],
          edges: [['u', 'v']],
        }),
      ),
    ).toBe('STRUCTURE');
    expect(
      reason(
        arch({
          groups: [
            { id: 'a', title: 'A', parent: 'b' },
            { id: 'b', title: 'B', parent: 'a' },
          ],
          nodes: [
            { id: 'u', title: 'U', group: 'a' },
            { id: 'v', title: 'V' },
          ],
          edges: [['u', 'v']],
        }),
      ),
    ).toBe('STRUCTURE');
    const deep = [
      { id: 'g1', title: 'G1' },
      { id: 'g2', title: 'G2', parent: 'g1' },
      { id: 'g3', title: 'G3', parent: 'g2' },
      { id: 'g4', title: 'G4', parent: 'g3' },
    ];
    expect(
      reason(
        arch({
          groups: deep,
          nodes: [
            { id: 'u', title: 'U', group: 'g4' },
            { id: 'v', title: 'V' },
          ],
          edges: [['u', 'v']],
        }),
      ),
    ).toBe('STRUCTURE');
    expect(reason(arch({ groups: [{ id: 'u', title: 'Same id as a node' }] }))).toBe('DUPLICATE_ID');
  });

  it('needs at least one connection', () => {
    expect(reason(arch({ edges: [] }))).toBe('STRUCTURE');
  });

  it('strips architecture-only fields from the other types so their saved JSON does not change', () => {
    const spec = parseInfographicSpec(
      base({
        groups: [{ id: 'g', title: 'G' }],
        nodes: [{ id: '1', title: 'a', icon: 'server', group: 'g' }, node('2'), node('3')],
        edges: [['1', '2', { label: 'x' }], ['2', '3']],
      }),
    );
    expect(spec).not.toHaveProperty('groups');
    expect(spec.nodes[0]).toEqual({ id: '1', title: 'a' });
    expect(spec.edges).toEqual([
      ['1', '2'],
      ['2', '3'],
    ]);
  });

  it('asks the model for groups, icons, labels and directions in the structured output schema', () => {
    const schema = infographicJsonSchema() as {
      required: string[];
      properties: {
        type: { enum: string[] };
        nodes: { items: { required: string[]; properties: { icon: { enum: string[] } } } };
        edges: { items: { required: string[] } };
      };
    };
    expect(schema.properties.type.enum).toContain('architecture');
    expect(schema.required).toContain('groups');
    // 층 구조 분류는 기술 스택 글에만 묻는다 (저장 Spec에는 남지 않는다)
    expect(schema.required).not.toContain('layers');
    expect((infographicJsonSchema({ layers: true }) as { required: string[] }).required).toContain('layers');
    expect(schema.properties.nodes.items.required).toEqual(['id', 'title', 'description', 'group', 'icon']);
    expect(schema.properties.nodes.items.properties.icon.enum).toEqual([...ARCHITECTURE_ICONS, 'none']);
    expect(schema.properties.edges.items.required).toEqual(['from', 'to', 'label', 'bidirectional']);
  });
});

describe('architecture — lines between groups (layers)', () => {
  const layers = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    type: 'architecture',
    title: 'Blink — Application Architecture',
    groups: [
      { id: 'ui', title: 'User Interface' },
      { id: 'core', title: 'Application Core' },
      { id: 'res', title: 'Storage & AI' },
    ],
    nodes: [
      { id: 'react', title: 'React 19.3', group: 'ui' },
      { id: 'tiptap', title: 'Tiptap 3.31', group: 'ui' },
      { id: 'electron', title: 'Electron 44.4', group: 'core' },
      { id: 'sqlite', title: 'SQLite 3.53', icon: 'database', group: 'res' },
    ],
    edges: [
      ['ui', 'core', { label: 'Preload / IPC' }],
      ['core', 'res'],
    ],
    ...overrides,
  });

  it('lets a line start or end at a group: layer to layer, group to card and card to group', () => {
    const spec = parseInfographicSpec(layers());
    expect(spec.edges).toEqual([['ui', 'core', { label: 'Preload / IPC' }], ['core', 'res']]);
    expect(parseInfographicSpec(spec)).toEqual(spec);
    const mixed = parseInfographicSpec(
      layers({
        nodes: [
          { id: 'u', title: 'Users', icon: 'user' },
          { id: 'react', title: 'React', group: 'ui' },
          { id: 'db', title: 'DB', group: 'res' },
        ],
        edges: [
          ['u', 'ui'],
          ['ui', 'db'],
        ],
      }),
    );
    expect(mixed.edges).toEqual([
      ['u', 'ui'],
      ['ui', 'db'],
    ]);
  });

  it('still rejects lines to unknown ids, to an empty group that is dropped, and between a group and what it holds', () => {
    expect(reason(layers({ edges: [['ui', 'nope']] }))).toBe('DANGLING_EDGE');
    expect(reason(layers({ edges: [['ui', 'ui']] }))).toBe('SELF_EDGE');
    expect(reason(layers({ groups: [...layers().groups, { id: 'empty', title: 'Empty' }], edges: [['ui', 'empty']] }))).toBe(
      'DANGLING_EDGE',
    );
    expect(reason(layers({ edges: [['ui', 'react']] }))).toBe('STRUCTURE');
    expect(
      reason(
        layers({
          groups: [
            { id: 'app', title: 'App' },
            { id: 'ui', title: 'UI', parent: 'app' },
          ],
          nodes: [
            { id: 'react', title: 'React', group: 'ui' },
            { id: 'db', title: 'DB' },
          ],
          edges: [
            ['app', 'react'],
            ['react', 'db'],
          ],
        }),
      ),
    ).toBe('STRUCTURE');
  });

  it('does not let other types point lines at groups', () => {
    expect(reason(base({ groups: [{ id: 'g', title: 'G' }], nodes: [{ ...node('1'), group: 'g' }, node('2')], edges: [['g', '2']] }))).toBe(
      'DANGLING_EDGE',
    );
  });

  it('calls a diagram a layer stack when every line joins two top-level groups and every card sits in one', () => {
    expect(isLayerStack(parseInfographicSpec(layers()))).toBe(true);
    // 카드에 닿는 선, 중첩된 그룹, 그룹 밖 카드, 그룹이 없는 그림은 아니다
    expect(isLayerStack(parseInfographicSpec(layers({ edges: [['ui', 'core'], ['electron', 'sqlite']] })))).toBe(false);
    expect(
      isLayerStack(
        parseInfographicSpec(
          layers({
            groups: [...layers().groups, { id: 'inner', title: 'Inner', parent: 'res' }],
            nodes: [...layers().nodes, { id: 'x', title: 'X', group: 'inner' }],
          }),
        ),
      ),
    ).toBe(false);
    expect(isLayerStack(parseInfographicSpec(layers({ nodes: [...layers().nodes, { id: 'u', title: 'Users' }] })))).toBe(false);
    expect(
      isLayerStack(
        parseInfographicSpec({ ...layers(), groups: [], nodes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], edges: [['a', 'b']] }),
      ),
    ).toBe(false);
  });

  it('also calls it a layer stack when one outer box holds the layers and lines run from a layer to cards outside', () => {
    // README: Electron이 Renderer·Main을 감싸고, Main에서 SQLite·OpenAI SDK로 나간다
    const framed = (over: Partial<Record<'groups' | 'nodes' | 'edges', unknown>> = {}) => ({
      version: 1,
      type: 'architecture',
      title: 'Blink',
      groups: [
        { id: 'app', title: 'Electron 44.4' },
        { id: 'ui', title: 'Renderer Process', parent: 'app' },
        { id: 'core', title: 'Main Process', parent: 'app' },
      ],
      nodes: [
        { id: 'react', title: 'React 19.3', group: 'ui' },
        { id: 'node', title: 'Node.js 24', group: 'core' },
        { id: 'sqlite', title: 'SQLite 3.53' },
        { id: 'sdk', title: 'OpenAI SDK 7' },
      ],
      edges: [
        ['ui', 'core', { label: 'IPC / Preload Bridge' }],
        ['core', 'sqlite'],
        ['core', 'sdk'],
      ],
      ...over,
    });
    expect(isLayerStack(parseInfographicSpec(framed()))).toBe(true);
    // 바깥 상자가 카드를 직접 품거나, 선이 카드끼리 잇거나, 바깥 상자에 닿거나, 바깥 카드에 선이 없으면 아니다
    expect(isLayerStack(parseInfographicSpec(framed({ nodes: [...(framed().nodes as object[]), { id: 'shell', title: 'Shell', group: 'app' }] })))).toBe(false);
    expect(isLayerStack(parseInfographicSpec(framed({ edges: [['ui', 'core'], ['node', 'sqlite'], ['core', 'sdk']] })))).toBe(false);
    expect(isLayerStack(parseInfographicSpec(framed({ edges: [['ui', 'core'], ['app', 'sqlite'], ['core', 'sdk']] })))).toBe(false);
    expect(isLayerStack(parseInfographicSpec(framed({ edges: [['ui', 'core'], ['core', 'sqlite']] })))).toBe(false);
  });

  it('finds loose cards: no line of their own and no line on any group around them', () => {
    expect(looseNodes(parseInfographicSpec(layers()))).toEqual([]);
    const spec = parseInfographicSpec(
      layers({
        nodes: [...layers().nodes, { id: 'u', title: 'Users' }, { id: 'x', title: 'X' }],
        edges: [['ui', 'core'], ['u', 'core']],
      }),
    );
    // res(Storage)에는 선이 없다 → 그 안의 sqlite도 떠 있다
    expect(looseNodes(spec).map((n) => n.id)).toEqual(['sqlite', 'x']);
  });
});
