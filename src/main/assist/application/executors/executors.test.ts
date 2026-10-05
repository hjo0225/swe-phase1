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
    // 층 규칙은 기술 스택 글에만 붙는다
    expect(system).not.toContain('Layers:');
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
      groups: [{ id: 'vpc', title: '  Production Virtual Private Cloud A in Seoul  ', parent: '' }],
      nodes: [
        { id: 'u', title: 'Users', description: '', group: '', icon: 'user' },
        { id: 'lb', title: 'Load Balancer', description: '', group: 'vpc', icon: 'load-balancer' },
      ],
      edges: [{ from: 'u', to: 'lb', label: ' HTTPS requests over port 443 ', bidirectional: true }],
    });
    const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
    const spec = (result as { spec: { groups: { title: string }[]; edges: [string, string, { label: string; bidirectional?: true }][] } }).spec;
    expect(spec.groups[0]!.title).toBe('Production Virtual Private Cloud A in S…');
    expect(spec.groups[0]!.title).toHaveLength(40);
    expect(spec.edges[0]).toEqual(['u', 'lb', { label: 'HTTPS requests over por…', bidirectional: true }]);
    expect(spec.edges[0]![2].label).toHaveLength(24);
  });

  it('repairs small slips in an architecture instead of failing the whole diagram', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      version: 1,
      type: 'architecture',
      title: 'Blink',
      groups: [
        { id: 'g1', title: 'Application Core', parent: '' },
        { id: 'g2', title: 'SQLite', parent: '' },
        { id: 'g3', title: 'Zone', parent: 'nope' },
      ],
      nodes: [
        { id: '1', title: 'Main (Electron 44.4 on Node.js 24, TypeScript 6.0)', description: '', group: 'g1', icon: 'server' },
        { id: '2', title: 'Users', description: '', group: '7', icon: 'user' },
        { id: '3', title: 'Web', description: '', group: 'g3', icon: 'server' },
      ],
      edges: [
        { from: 'g1', to: 'g2', label: '', bidirectional: false },
        { from: '2', to: 'g1', label: '', bidirectional: false },
        { from: '2', to: '3', label: '', bidirectional: false },
      ],
    });
    const result = await new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured }), signal);
    const spec = (result as { spec: { groups: unknown; nodes: { id: string; title: string; group?: string }[]; edges: unknown } }).spec;
    // 40자를 넘는 카드 이름은 줄인다
    expect(spec.nodes[0]!.title).toHaveLength(40);
    // 없는 그룹·부모는 가리키지 않는다 (맨 바깥으로)
    expect(spec.nodes.find((n) => n.id === '2')).toEqual({ id: '2', title: 'Users', icon: 'user' });
    // 선이 가리키는 빈 상자는 구성요소다 → 같은 이름의 카드
    expect(spec.nodes).toContainEqual({ id: 'g2', title: 'SQLite' });
    expect(spec.groups).toEqual([
      { id: 'g1', title: 'Application Core' },
      { id: 'g3', title: 'Zone' },
    ]);
    expect(spec.edges).toEqual([
      ['g1', 'g2'],
      ['2', 'g1'],
      ['2', '3'],
    ]);
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

  it('adds the layer rules for a text that names its technologies with versions', async () => {
    const generateStructured = vi.fn().mockResolvedValue(llmSpec);
    await new VisualizeExecutor().execute(
      InputSnapshot.of('the screen is react 19.3 with tiptap 3.31, main is electron 44.4 on node.js 24'),
      fakeProvider({ generateStructured }),
      signal,
    );
    const { system } = generateStructured.mock.calls[0]![0] as { system: string };
    expect(system).toContain('Layers: this text names its technologies with version numbers');
    expect(system).toContain('from group id to group id');
  });

  describe('a text the model calls a layer stack', () => {
    const layer = (id: string, title: string, parent = '') => ({ id, title, parent });
    const card = (id: string, title: string, group: string) => ({ id, title, description: '', group, icon: 'server' });
    const line = (from: string, to: string, label = '') => ({ from, to, label, bidirectional: false });
    const groups = [layer('g1', 'Screen'), layer('g2', 'Main'), layer('g3', 'Resources')];
    const cards = [
      card('1', 'React 19.3', 'g1'),
      card('2', 'Tiptap 3.31', 'g1'),
      card('3', 'Electron 44.4', 'g2'),
      card('4', 'Node.js 24', 'g2'),
      card('5', 'Markdown files', 'g3'),
      card('6', 'SQLite 3.53', 'g3'),
      card('7', 'better-sqlite3', 'g3'),
    ];
    // 기술 이름에 버전을 붙인 글 (층 규칙을 받는 글)
    const STACK = 'the screen is react 19.3 with tiptap 3.31, main is electron 44.4 on node.js 24, notes in sqlite 3.53';
    const run = async (layers: boolean, g: unknown[], nodes: unknown[], edges: unknown[], text = STACK) => {
      const generateStructured = vi.fn().mockResolvedValue({ version: 1, type: 'architecture', title: 'Blink', layers, groups: g, nodes, edges });
      const result = await new VisualizeExecutor().execute(InputSnapshot.of(text), fakeProvider({ generateStructured }), signal);
      return (result as { spec: { groups?: unknown; nodes: { id: string; title: string; group?: string }[]; edges: unknown } }).spec;
    };

    it('keeps one line between neighbouring layers and drops lines inside a layer', async () => {
      const spec = await run(true, groups, cards, [
        line('1', '3', 'preload / IPC'),
        line('2', '3', 'preload / IPC'),
        line('3', '4'),
        line('3', '5', 'plain markdown files'),
        line('3', '6', 'search and link index'),
        line('7', '6'),
      ]);
      // 같은 라벨이면 남기고, 서로 다른 라벨이 한 선으로 모이면 뺀다
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'preload / IPC' }], ['g2', 'g3']]);
      expect(spec.nodes.map((n) => n.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });

    it('keeps an outer box that holds the layers, and versioned technologies outside it as cards reached from a layer', async () => {
      // README: Electron이 Renderer·Main을 감싸고, Main에서 SQLite·OpenAI SDK로 나간다
      const spec = await run(
        true,
        [layer('g0', 'Electron 44.4'), layer('g1', 'Renderer Process', 'g0'), layer('g2', 'Main Process', 'g0')],
        [
          card('1', 'React 19.3', 'g1'),
          card('2', 'Tiptap 3.31', 'g1'),
          card('3', 'Node.js 24', 'g2'),
          card('4', 'IPC / Preload Bridge', ''),
          card('5', 'SQLite 3.53', ''),
          card('6', 'OpenAI SDK 7', ''),
        ],
        [line('1', '4'), line('4', '3'), line('3', '5', 'search and link index'), line('g2', '6')],
      );
      expect(spec.groups).toEqual([
        { id: 'g0', title: 'Electron 44.4' },
        { id: 'g1', title: 'Renderer Process', parent: 'g0' },
        { id: 'g2', title: 'Main Process', parent: 'g0' },
      ]);
      expect(spec.nodes.map((n) => n.title)).toEqual(['React 19.3', 'Tiptap 3.31', 'Node.js 24', 'SQLite 3.53', 'OpenAI SDK 7']);
      expect(spec.edges).toEqual([
        ['g1', 'g2', { label: 'IPC / Preload Bridge' }],
        ['g2', '5', { label: 'search and link index' }],
        ['g2', '6'],
      ]);
    });

    it('turns a card standing between two layers into the label of the line between them', async () => {
      const spec = await run(true, groups, [...cards, card('8', 'Preload / IPC', '')], [line('2', '8'), line('8', '3'), line('3', '6')]);
      expect(spec.nodes.map((n) => n.id)).not.toContain('8');
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'Preload / IPC' }], ['g2', 'g3']]);
    });

    it('turns a box inside a layer into a card in that layer, before what it held', async () => {
      const spec = await run(
        true,
        [...groups, layer('g4', 'SQLite 3.53', 'g3')],
        [card('1', 'React 19.3', 'g1'), card('3', 'Electron 44.4', 'g2'), card('5', 'Markdown files', 'g3'), card('7', 'better-sqlite3', 'g4')],
        [line('1', '3'), line('3', '7')],
      );
      expect(spec.groups).toEqual([
        { id: 'g1', title: 'Screen' },
        { id: 'g2', title: 'Main' },
        { id: 'g3', title: 'Resources' },
      ]);
      expect(spec.nodes.map((n) => [n.title, n.group])).toEqual([
        ['React 19.3', 'g1'],
        ['Electron 44.4', 'g2'],
        ['Markdown files', 'g3'],
        ['SQLite 3.53', 'g3'],
        ['better-sqlite3', 'g3'],
      ]);
      expect(spec.edges).toEqual([
        ['g1', 'g2'],
        ['g2', 'g3'],
      ]);
    });

    it('folds a service that only one technology calls into that technology name', async () => {
      const spec = await run(
        true,
        groups,
        [...cards, card('8', 'OpenAI SDK 7', 'g3'), card('9', 'OpenAI', ''), card('10', 'Kimi', '')],
        [line('1', '3', 'IPC'), line('3', '8'), line('8', '9'), line('8', '10')],
      );
      expect(spec.nodes.find((n) => n.id === '8')!.title).toBe('OpenAI SDK 7 (OpenAI, Kimi)');
      expect(spec.nodes.map((n) => n.id)).not.toContain('9');
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'IPC' }], ['g2', 'g3']]);
    });

    it('does not repeat a service the technology name already has, and keeps the name short enough', async () => {
      const spec = await run(
        true,
        groups,
        [...cards, card('8', 'OpenAI SDK 7 (OpenAI, Kimi)', 'g3'), card('9', 'OpenAI', ''), card('10', 'Kimi', ''), card('11', 'Anthropic Claude Models', '')],
        [line('1', '3', 'IPC'), line('3', '8'), line('8', '9'), line('8', '10'), line('8', '11')],
      );
      const title = spec.nodes.find((n) => n.id === '8')!.title;
      expect(title.startsWith('OpenAI SDK 7 (OpenAI, Kimi, Anthropic')).toBe(true);
      expect(title.length).toBeLessThanOrEqual(40);
    });

    it('also treats an organized list of layers as a layer stack when the model does not say so', async () => {
      const text = [
        '## Components',
        '- Screen',
        '  - React 19.3',
        '- Main',
        '  - Electron 44.4',
        '- Resources',
        '  - SQLite 3.53',
        '## Flows',
        '- Screen → Main: preload / IPC',
        '- Main → Resources',
      ].join('\n');
      const generateStructured = vi.fn().mockResolvedValue({
        version: 1,
        type: 'architecture',
        title: 'Blink',
        layers: false,
        groups,
        nodes: [card('1', 'React 19.3', 'g1'), card('3', 'Electron 44.4', 'g2'), card('6', 'SQLite 3.53', 'g3')],
        edges: [line('1', '3', 'preload / IPC'), line('3', '6')],
      });
      const result = await new VisualizeExecutor().execute(InputSnapshot.of(text), fakeProvider({ generateStructured }), signal);
      expect((result as { spec: { edges: unknown } }).spec.edges).toEqual([['g1', 'g2', { label: 'preload / IPC' }], ['g2', 'g3']]);
    });

    it('treats a tech-stack answer whose cards all sit in top-level boxes as a layer stack, even when the model says it is not', async () => {
      const spec = await run(false, groups, cards, [line('1', '3', 'preload / IPC'), line('2', '3', 'preload / IPC'), line('3', '4'), line('3', '6')]);
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'preload / IPC' }], ['g2', 'g3']]);
    });

    it('merges a card named like a layer into that layer and drops lines that point at nothing', async () => {
      const spec = await run(
        true,
        groups,
        [card('s', 'Screen', ''), card('m', 'main', ''), ...cards],
        [line('s', 'm', 'preload / IPC'), line('m', 'g3'), line('6', 'OpenAI')],
      );
      expect(spec.nodes.map((n) => n.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'preload / IPC' }], ['g2', 'g3']]);
    });

    it('leaves every line alone when the model does not call the text a layer stack', async () => {
      // 그룹 밖 카드가 있으면 모델의 답(layers false)을 따른다
      const spec = await run(false, groups, [...cards, card('9', 'Users', '')], [line('9', '1'), line('1', '3', 'IPC'), line('3', '6')]);
      expect(spec.edges).toEqual([['9', '1'], ['1', '3', { label: 'IPC' }], ['3', '6']]);
      // 버전 없는 글이면 모델이 층이라고 해도 믿지 않는다 (층 규칙을 받지 않았다)
      const plain = await run(true, groups, cards, [line('1', '3', 'IPC'), line('3', '6')], 'the ui is react, it calls main over ipc');
      expect(plain.edges).toEqual([['1', '3', { label: 'IPC' }], ['3', '6']]);
    });
  });

  describe('lines between layers', () => {
    const layer = (id: string, title: string) => ({ id, title, parent: '' });
    const tech = (id: string, title: string, group: string) => ({ id, title, description: '', group, icon: 'server' });
    const line = (from: string, to: string, label = '') => ({ from, to, label, bidirectional: false });
    const run = async (groups: unknown[], nodes: unknown[], edges: unknown[], text = 'x') => {
      const generateStructured = vi.fn().mockResolvedValue({ version: 1, type: 'architecture', title: 'Blink', groups, nodes, edges });
      const result = await new VisualizeExecutor().execute(InputSnapshot.of(text), fakeProvider({ generateStructured }), signal);
      return (result as { spec: { groups?: unknown; nodes: unknown; edges: unknown } }).spec;
    };

    it('keeps a line that joins two layers whose cards have no lines of their own', async () => {
      const spec = await run(
        [layer('g1', 'User Interface'), layer('g2', 'Application Core'), layer('g3', 'Storage & AI')],
        [tech('1', 'React 19.3', 'g1'), tech('2', 'Tiptap 3.31', 'g1'), tech('3', 'Electron 44.4', 'g2'), tech('4', 'SQLite 3.53', 'g3')],
        [line('g1', 'g2', 'Preload / IPC'), line('g2', 'g3')],
      );
      expect(spec.groups).toEqual([
        { id: 'g1', title: 'User Interface' },
        { id: 'g2', title: 'Application Core' },
        { id: 'g3', title: 'Storage & AI' },
      ]);
      expect(spec.edges).toEqual([['g1', 'g2', { label: 'Preload / IPC' }], ['g2', 'g3']]);
    });

    it('keeps a line from a card to a layer, but still opens a box whose cards have lines of their own', async () => {
      const spec = await run(
        [layer('g1', 'Cloud'), layer('g2', 'Main')],
        [tech('1', 'Users', ''), tech('2', 'OpenAI', 'g1'), tech('3', 'Queue', 'g2'), tech('4', 'Kimi', '')],
        [line('1', 'g1'), line('1', 'g2'), line('3', '4')],
      );
      expect(spec.groups).toEqual([{ id: 'g1', title: 'Cloud' }]);
      expect(spec.edges).toEqual([
        ['1', 'g1'],
        ['1', 'g2'],
        ['3', '4'],
      ]);
      expect(spec.nodes).toContainEqual({ id: 'g2', title: 'Main' });
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
