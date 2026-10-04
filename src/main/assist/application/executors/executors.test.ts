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

  it('rejects specs that break the structure rules', async () => {
    const broken = { ...llmSpec, edges: [{ from: '1', to: '9' }] };
    await expect(
      new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured: async () => broken }), signal),
    ).rejects.toMatchObject({ name: 'InfographicSpecError' });
  });
});
