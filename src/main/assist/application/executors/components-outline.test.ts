import { describe, expect, it } from 'vitest';
import { outlineContainers, outlineLayers, unnestFlowComponents } from './components-outline';

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
        // Job queue 아래 Worker는 어느 연결에도 나오지 않는다 → 떠 있는 카드가 되지 않게 이름 뒤 괄호로
        '- Job queue (Worker)',
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

  it('folds what is listed under a connected component into its name when none of it is connected', () => {
    const text = lines(
      '- Electron app',
      '  - UI',
      '    - React',
      '    - Tiptap editor',
      '  - Preload',
      '- Main',
      '- OS keychain (macOS)',
      '  - API keys',
      '- UI → Preload',
      '- Preload → Main: IPC',
      '- Main → OS keychain: keys',
    );
    expect(unnestFlowComponents(text)).toBe(
      lines(
        '- Electron app',
        '  - UI (React, Tiptap editor)',
        '  - Preload',
        '- Main',
        '- OS keychain (macOS, API keys)',
        '- UI → Preload',
        '- Preload → Main: IPC',
        '- Main → OS keychain: keys',
      ),
    );
    // UI는 다른 층 후보와 이어지지 않았다 → 층이 아니다
    expect(outlineLayers(text)).toEqual([]);
  });

  it('keeps layers nested: flows between items whose own items take part in no flow', () => {
    const layered = lines(
      '## Components',
      '- User Interface (Renderer)',
      '  - React 19.3',
      '  - Tiptap 3.31',
      '- Application Core (Electron Main)',
      '  - Electron 44.4',
      '- Storage & AI Services',
      '  - SQLite 3.53',
      '- Users',
      '## Flows',
      '- User Interface → Application Core: Preload / IPC',
      '- Application Core → Storage & AI Services',
      '- Users → User Interface',
    );
    expect(unnestFlowComponents(layered)).toBe(layered);
    expect(outlineLayers(layered)).toEqual(['user interface', 'application core', 'storage & ai services']);
    expect(outlineContainers(layered).map((c) => c.title)).toEqual([
      'User Interface (Renderer)',
      'Application Core (Electron Main)',
      'Storage & AI Services',
    ]);
  });

  it('only counts top-level items as layers, so a technology with its own parts inside a layer is folded', () => {
    const text = lines(
      '- Screen',
      '  - React 19.3',
      '- Main',
      '  - Electron 44.4',
      '- Resources',
      '  - SQLite 3.53',
      '    - better-sqlite3',
      '    - Drizzle ORM',
      '- Screen → Main: preload / IPC',
      '- Main → SQLite 3.53: search and link index',
    );
    expect(outlineLayers(text)).toEqual(['screen', 'main']);
    expect(unnestFlowComponents(text)).toBe(
      lines(
        '- Screen',
        '  - React 19.3',
        '- Main',
        '  - Electron 44.4',
        '- Resources',
        '  - SQLite 3.53 (better-sqlite3, Drizzle ORM)',
        '- Screen → Main: preload / IPC',
        '- Main → SQLite 3.53: search and link index',
      ),
    );
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
