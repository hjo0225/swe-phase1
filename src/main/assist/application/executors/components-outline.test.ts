import { describe, expect, it } from 'vitest';
import { outlineContainers, unnestFlowComponents } from './components-outline';

const lines = (...l: string[]) => l.join('\n');

describe('unnestFlowComponents', () => {
  it('moves what is listed under a component that is itself in a flow up next to it', () => {
    const text = lines(
      '## Components',
      '- Electron app',
      '  - UI (React)',
      '- Main',
      '  - Job queue',
      '    - Worker',
      '- OpenAI',
      '## Flows',
      '- UI → Main: IPC',
      '- Main → Job queue',
      '- Job queue → OpenAI: HTTPS',
    );
    expect(unnestFlowComponents(text)).toBe(
      lines(
        '## Components',
        '- Electron app',
        '  - UI (React)',
        '- Main',
        '- Job queue',
        // Job queue도 연결에 나오므로 Worker도 그 옆으로 올라온다
        '- Worker',
        '- OpenAI',
        '## Flows',
        '- UI → Main: IPC',
        '- Main → Job queue',
        '- Job queue → OpenAI: HTTPS',
      ),
    );
  });

  it('also unnests a deeper item and matches names case-insensitively, ignoring technologies in parentheses', () => {
    const text = lines(
      '- VPC',
      '  - Web server (nginx)',
      '    - Cache',
      '- Users',
      'users → web server: HTTPS',
      'Web server ↔ Cache',
    );
    expect(unnestFlowComponents(text)).toBe(
      lines('- VPC', '  - Web server (nginx)', '  - Cache', '- Users', 'users → web server: HTTPS', 'Web server ↔ Cache'),
    );
  });

  it('leaves containers that are not in any flow, and text without flows, as they are', () => {
    const nested = lines('- VPC A', '  - Zone A', '    - Web', '- Users', '- Users → Web: HTTPS');
    expect(unnestFlowComponents(nested)).toBe(nested);
    const plain = lines('Meeting notes', '- talked about the API', '  - pick one by Friday');
    expect(unnestFlowComponents(plain)).toBe(plain);
  });
});

describe('outlineContainers', () => {
  it('lists the items that hold others, outermost first, with their parent and the parts directly inside', () => {
    const text = lines(
      '## Components',
      '- Electron app',
      '  - UI (React)',
      '  - Process host',
      '    - Main',
      '- OpenAI',
      '## Flows',
      '- UI → Main: IPC',
      '- Main → OpenAI: HTTPS',
    );
    expect(outlineContainers(text)).toEqual([
      { title: 'Electron app', parts: ['UI (React)'] },
      { title: 'Process host', parent: 'Electron app', parts: ['Main'] },
    ]);
  });

  it('finds nothing in a flat list or plain text', () => {
    expect(outlineContainers(lines('- Users', '- Website', '- Users → Website'))).toEqual([]);
    expect(outlineContainers('just a sentence')).toEqual([]);
  });
});
