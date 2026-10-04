import { describe, expect, it, vi } from 'vitest';
import { fakeProvider } from '../../../ai-provider/testing';
import { InputSnapshot } from '../../domain/input-snapshot';
import { ExpandExecutor } from './expand-executor';
import { VisualizeExecutor } from './visualize-executor';

const signal = new AbortController().signal;

describe('ExpandExecutor', () => {
  it('researches with web search and appends normalized sources', async () => {
    const researchAndGenerate = vi.fn().mockResolvedValue({
      text: 'Electron은 Chromium과 Node.js 기반이다.',
      sources: [{ title: 'Electron', url: 'https://www.electronjs.org/' }],
    });
    const result = await new ExpandExecutor().execute(
      InputSnapshot.of('Electron은 데스크톱 앱 프레임워크다.'),
      fakeProvider({ researchAndGenerate }),
      signal,
    );
    expect(result).toEqual({
      kind: 'RESEARCHED_MARKDOWN',
      markdown: 'Electron은 Chromium과 Node.js 기반이다.\n\n**Sources**\n- [Electron](https://www.electronjs.org/)',
      sources: [{ title: 'Electron', url: 'https://www.electronjs.org/' }],
    });
    expect(researchAndGenerate.mock.calls[0]![0]).toMatchObject({ user: 'Electron은 데스크톱 앱 프레임워크다.' });
  });

  it('fails with NO_SOURCES when the search found nothing usable', async () => {
    await expect(
      new ExpandExecutor().execute(
        InputSnapshot.of('x'),
        fakeProvider({ researchAndGenerate: async () => ({ text: '본문', sources: [] }) }),
        signal,
      ),
    ).rejects.toMatchObject({ code: 'NO_SOURCES' });
  });
});

describe('VisualizeExecutor', () => {
  const llmSpec = {
    version: 1,
    type: 'process',
    title: 'Blink AI 처리 과정',
    nodes: [
      { id: '1', title: '노트 작성', description: '사용자가 내용을 작성' },
      { id: '2', title: 'AI 처리', description: '' },
    ],
    edges: [{ from: '1', to: '2' }],
  };

  it('requests the infographic schema and returns a validated spec', async () => {
    const generateStructured = vi.fn().mockResolvedValue(llmSpec);
    const result = await new VisualizeExecutor().execute(
      InputSnapshot.of('노트를 쓰면 AI가 처리한다'),
      fakeProvider({ generateStructured }),
      signal,
    );
    expect(result).toEqual({
      kind: 'INFOGRAPHIC',
      spec: {
        version: 1,
        type: 'process',
        title: 'Blink AI 처리 과정',
        nodes: [
          { id: '1', title: '노트 작성', description: '사용자가 내용을 작성' },
          { id: '2', title: 'AI 처리' },
        ],
        edges: [['1', '2']],
      },
    });
    expect(generateStructured.mock.calls[0]![0]).toMatchObject({
      schemaName: 'infographic_spec',
      jsonSchema: { type: 'object' },
    });
    const { system } = generateStructured.mock.calls[0]![0] as { system: string };
    expect(system).toContain('only when the text says it is there');
    expect(system).toContain('Do not restate the action');
  });

  it('sends a components list whose flow components hold nothing, so they are drawn as cards', async () => {
    const generateStructured = vi.fn().mockResolvedValue(llmSpec);
    await new VisualizeExecutor().execute(
      InputSnapshot.of('## Components\n- App\n  - Main\n    - Queue\n## Flows\n- Main → Queue'),
      fakeProvider({ generateStructured }),
      signal,
    );
    const { user } = generateStructured.mock.calls[0]![0] as { user: string };
    expect(user).toBe('## Components\n- App\n  - Main\n  - Queue\n## Flows\n- Main → Queue');
  });

  describe('boxes the components list puts things in', () => {
    const arch = (nodes: unknown[], groups: unknown[] = []) =>
      vi.fn().mockResolvedValue({
        version: 1,
        type: 'architecture',
        title: 'Electron app architecture',
        groups,
        nodes,
        edges: [
          { from: '1', to: '2', label: 'IPC', bidirectional: false },
          { from: '2', to: '3', label: 'HTTPS', bidirectional: false },
        ],
      });
    const card = (id: string, title: string, group = '') => ({ id, title, description: '', group, icon: 'server' });
    const text = '## Components\n- Electron app\n  - UI (React)\n  - Main\n- OpenAI\n## Flows\n- UI → Main: IPC\n- Main → OpenAI: HTTPS';
    const specOf = async (generateStructured: ReturnType<typeof arch>) =>
      ((await new VisualizeExecutor().execute(InputSnapshot.of(text), fakeProvider({ generateStructured }), signal)) as {
        spec: { groups?: unknown; nodes: unknown };
      }).spec;

    it('adds a box the model left out and puts its ungrouped parts in it', async () => {
      const spec = await specOf(arch([card('1', 'UI (React)'), card('2', 'main'), card('3', 'OpenAI')]));
      expect(spec.groups).toEqual([{ id: 'o1', title: 'Electron app' }]);
      expect(spec.nodes).toEqual([
        { id: '1', title: 'UI (React)', group: 'o1', icon: 'server' },
        { id: '2', title: 'main', group: 'o1', icon: 'server' },
        { id: '3', title: 'OpenAI', icon: 'server' },
      ]);
    });

    it('keeps the box and the places the model already drew', async () => {
      const spec = await specOf(
        arch([card('1', 'UI', 'g1'), card('2', 'Main', 'g2'), card('3', 'OpenAI')], [
          { id: 'g1', title: 'Electron app', parent: '' },
          { id: 'g2', title: 'Main process', parent: 'g1' },
        ]),
      );
      expect(spec.groups).toEqual([
        { id: 'g1', title: 'Electron app' },
        { id: 'g2', title: 'Main process', parent: 'g1' },
      ]);
      expect(spec.nodes).toEqual([
        { id: '1', title: 'UI', group: 'g1', icon: 'server' },
        { id: '2', title: 'Main', group: 'g2', icon: 'server' },
        { id: '3', title: 'OpenAI', icon: 'server' },
      ]);
    });
  });

  it('turns the model output into an architecture spec with groups, icons and labelled lines', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      version: 1,
      type: 'architecture',
      title: 'Serverless web app',
      groups: [{ id: 'app', title: 'Web Application', parent: '' }],
      nodes: [
        { id: 'u', title: 'Users', description: '', group: '', icon: 'user' },
        { id: 'gw', title: 'API Gateway', description: '', group: 'app', icon: 'gateway' },
        { id: 'fn', title: 'Cloud Functions', description: '', group: 'app', icon: 'function' },
      ],
      edges: [
        { from: 'u', to: 'gw', label: 'Get/Post', bidirectional: false },
        { from: 'gw', to: 'fn', label: '', bidirectional: false },
      ],
    });
    const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
    expect(result).toEqual({
      kind: 'INFOGRAPHIC',
      spec: {
        version: 1,
        type: 'architecture',
        title: 'Serverless web app',
        groups: [{ id: 'app', title: 'Web Application' }],
        nodes: [
          { id: 'u', title: 'Users', icon: 'user' },
          { id: 'gw', title: 'API Gateway', group: 'app', icon: 'gateway' },
          { id: 'fn', title: 'Cloud Functions', group: 'app', icon: 'function' },
        ],
        edges: [['u', 'gw', { label: 'Get/Post' }], ['gw', 'fn']],
      },
    });
  });

  it('shortens a slightly long line label or group title instead of failing the whole diagram', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      version: 1,
      type: 'architecture',
      title: 'Web service',
      groups: [{ id: 'vpc', title: '  Production Virtual Private Cloud A  ', parent: '' }],
      nodes: [
        { id: 'u', title: 'Users', description: '', group: '', icon: 'user' },
        { id: 'lb', title: 'Load Balancer', description: '', group: 'vpc', icon: 'load-balancer' },
      ],
      edges: [{ from: 'u', to: 'lb', label: ' HTTPS requests over port 443 ', bidirectional: true }],
    });
    const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
    const spec = (result as { spec: { groups: { title: string }[]; edges: [string, string, { label: string; bidirectional?: true }][] } }).spec;
    expect(spec.groups[0]!.title).toBe('Production Virtual Private Cl…');
    expect(spec.groups[0]!.title).toHaveLength(30);
    expect(spec.edges[0]).toEqual(['u', 'lb', { label: 'HTTPS requests over por…', bidirectional: true }]);
    expect(spec.edges[0]![2].label).toHaveLength(24);
  });

  describe('a group and a card with the same name', () => {
    const run = async (nodes: unknown[], edges: unknown[]) => {
      const generateStructured = vi.fn().mockResolvedValue({
        version: 1,
        type: 'architecture',
        title: 'App',
        groups: [
          { id: 'g1', title: 'Electron app', parent: '' },
          { id: 'g2', title: 'Main', parent: 'g1' },
        ],
        nodes,
        edges,
      });
      const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
      return (result as { spec: { groups?: unknown; nodes: unknown; edges: unknown } }).spec;
    };
    const node = (id: string, title: string, group: string) => ({ id, title, description: '', group, icon: 'server' });
    const edge = (from: string, to: string) => ({ from, to, label: '', bidirectional: false });

    it('drops a card without lines that only repeats a group name', async () => {
      const spec = await run(
        [node('1', 'Electron app', ''), node('2', 'UI', 'g1'), node('3', 'Main', 'g2'), node('4', 'Queue', 'g2')],
        [edge('2', '3'), edge('3', '4')],
      );
      expect(spec.nodes).toEqual([
        { id: '2', title: 'UI', group: 'g1', icon: 'server' },
        { id: '3', title: 'Main', group: 'g1', icon: 'server' },
        { id: '4', title: 'Queue', group: 'g1', icon: 'server' },
      ]);
    });

    it('turns a box that a line points at into a card next to what it held, instead of failing the diagram', async () => {
      const spec = await run(
        [node('2', 'UI', 'g1'), node('4', 'Queue', 'g2')],
        [edge('2', 'g2'), edge('g2', '4'), edge('4', '4')],
      );
      expect(spec.groups).toEqual([{ id: 'g1', title: 'Electron app' }]);
      expect(spec.nodes).toEqual([
        { id: '2', title: 'UI', group: 'g1', icon: 'server' },
        { id: '4', title: 'Queue', group: 'g1', icon: 'server' },
        { id: 'g2', title: 'Main', group: 'g1' },
      ]);
      // 자기 자신을 가리키는 선은 그릴 수 없어 뺀다
      expect(spec.edges).toEqual([
        ['2', 'g2'],
        ['g2', '4'],
      ]);
    });

    it('keeps a connected card and opens its same-named box, moving what was inside one level up', async () => {
      const spec = await run(
        [node('2', 'UI', 'g1'), node('3', 'main', 'g2'), node('4', 'Queue', 'g2')],
        [edge('2', '3'), edge('3', '4')],
      );
      expect(spec.groups).toEqual([{ id: 'g1', title: 'Electron app' }]);
      expect(spec.nodes).toEqual([
        { id: '2', title: 'UI', group: 'g1', icon: 'server' },
        { id: '3', title: 'main', group: 'g1', icon: 'server' },
        { id: '4', title: 'Queue', group: 'g1', icon: 'server' },
      ]);
      expect(spec.edges).toEqual([
        ['2', '3'],
        ['3', '4'],
      ]);
    });
  });

  it('renames a group whose id is also a node id, and moves the nodes and child groups with it', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      version: 1,
      type: 'architecture',
      title: 'Web service',
      groups: [
        { id: '1', title: 'VPC A', parent: '' },
        { id: '2', title: 'Zone A', parent: '1' },
      ],
      nodes: [
        { id: '1', title: 'Users', description: '', group: '', icon: 'user' },
        { id: '2', title: 'Load Balancer', description: '', group: '1', icon: 'load-balancer' },
        { id: '3', title: 'Web', description: '', group: '2', icon: 'server' },
      ],
      edges: [
        { from: '1', to: '2', label: 'HTTPS', bidirectional: false },
        { from: '2', to: '3', label: '', bidirectional: false },
      ],
    });
    const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
    const spec = (result as { spec: { groups: unknown; nodes: unknown; edges: unknown } }).spec;
    expect(spec.groups).toEqual([
      { id: 'g1', title: 'VPC A' },
      { id: 'g2', title: 'Zone A', parent: 'g1' },
    ]);
    expect(spec.nodes).toEqual([
      { id: '1', title: 'Users', icon: 'user' },
      { id: '2', title: 'Load Balancer', group: 'g1', icon: 'load-balancer' },
      { id: '3', title: 'Web', group: 'g2', icon: 'server' },
    ]);
    expect(spec.edges).toEqual([['1', '2', { label: 'HTTPS' }], ['2', '3']]);
  });

  it('rejects specs that break the structure rules', async () => {
    const broken = { ...llmSpec, edges: [{ from: '1', to: '9' }] };
    await expect(
      new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured: async () => broken }), signal),
    ).rejects.toMatchObject({ name: 'InfographicSpecError' });
  });
});
