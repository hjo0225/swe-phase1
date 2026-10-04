import { describe, expect, it } from 'vitest';
import { isTechStackText } from './tech-stack';

describe('isTechStackText', () => {
  it('finds a text that names three or more technologies with versions', () => {
    expect(
      isTechStackText(
        "the screen is react 19.3 with tiptap 3.31 as the editor, it can't touch files itself. main is electron 44.4 on node.js 24, all written in typescript 6.0.",
      ),
    ).toBe(true);
    expect(isTechStackText('## Components\n- Frontend\n  - Vue 3\n  - Pinia\n- Backend\n  - Django 5\n  - Python 3.12')).toBe(true);
  });

  it('does not count texts without versions, a single version, ports or counts', () => {
    expect(
      isTechStackText(
        "electron app. the ui is react + tiptap editor, it only sends requests to main through preload over ipc. ai requests go to openai or kimi over https.",
      ),
    ).toBe(false);
    expect(isTechStackText('we moved to node 24 last week and it is fine')).toBe(false);
    expect(isTechStackText('users reach port 443, then 2 web servers in zone 1 and zone 2 call the db')).toBe(false);
  });
});
