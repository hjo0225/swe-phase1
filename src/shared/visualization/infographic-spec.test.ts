import { describe, expect, it } from 'vitest';
import { InfographicSpecError, infographicJsonSchema, parseInfographicSpec } from './infographic-spec';

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
    expect(reason(base({ type: 'mindmap' }))).toBe('UNSUPPORTED_TYPE');
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

describe('infographicJsonSchema', () => {
  it('describes a strict object with object edges for structured output', () => {
    const schema = infographicJsonSchema();
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['version', 'type', 'title', 'nodes', 'edges'],
      properties: {
        type: { enum: ['process', 'hierarchy'] },
        edges: { type: 'array', items: { type: 'object', required: ['from', 'to'] } },
      },
    });
  });
});
