import { describe, expect, it } from 'vitest';
import { createSenderValidator } from './sender';

describe('createSenderValidator', () => {
  it('accepts the app bundle loaded from file:// in production', () => {
    const isTrusted = createSenderValidator({});
    expect(isTrusted('file:///C:/Program%20Files/Blink/resources/app.asar/out/renderer/index.html#/notes/1')).toBe(true);
  });

  it('accepts only the dev server origin in development', () => {
    const isTrusted = createSenderValidator({ devServerUrl: 'http://localhost:5173' });
    expect(isTrusted('http://localhost:5173/#/')).toBe(true);
    expect(isTrusted('http://localhost:5174/#/')).toBe(false);
    expect(isTrusted('file:///C:/x/index.html')).toBe(false);
  });

  it('rejects remote pages, missing frames and garbage', () => {
    const isTrusted = createSenderValidator({});
    expect(isTrusted('https://evil.example/')).toBe(false);
    expect(isTrusted(undefined)).toBe(false);
    expect(isTrusted('not a url')).toBe(false);
  });
});
