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

  it('rejects specs that break the structure rules', async () => {
    const broken = { ...llmSpec, edges: [{ from: '1', to: '9' }] };
    await expect(
      new VisualizeExecutor().execute(InputSnapshot.of('x'), fakeProvider({ generateStructured: async () => broken }), signal),
    ).rejects.toMatchObject({ name: 'InfographicSpecError' });
  });
});
