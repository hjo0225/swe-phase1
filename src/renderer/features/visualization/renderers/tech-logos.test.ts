import { describe, expect, it } from 'vitest';
import { techLogoFor } from './tech-logos';

describe('techLogoFor', () => {
  it('finds the logo of a technology named in a card title, with or without a version', () => {
    expect(techLogoFor('TypeScript 6.0')?.name).toBe('TypeScript');
    expect(techLogoFor('React 19.3')?.name).toBe('React');
    expect(techLogoFor('Electron 44.4')?.name).toBe('Electron');
    expect(techLogoFor('Node.js 24')?.name).toBe('Node.js');
    expect(techLogoFor('SQLite 3.53')?.name).toBe('SQLite');
    expect(techLogoFor('Markdown files')?.name).toBe('Markdown');
    expect(techLogoFor('Kimi')?.name).toBe('Moonshot AI');
  });

  it('prefers the more specific technology when a title names two', () => {
    expect(techLogoFor('better-sqlite3 / Drizzle ORM')?.name).toBe('Drizzle');
  });

  it('keeps the generic icon for components that are not a known technology', () => {
    expect(techLogoFor('Load balancer')).toBeNull();
    expect(techLogoFor('Users')).toBeNull();
    expect(techLogoFor('Reactor pattern')).toBeNull(); // 단어 일부만 같으면 아니다
    // 여러 서비스를 함께 적은 카드에 한쪽 로고를 붙이지 않는다
    expect(techLogoFor('OpenAI SDK 7 (OpenAI, Kimi)')).toBeNull();
    expect(techLogoFor('OpenAI / Kimi')).toBeNull();
  });

  it('darkens brand colours that would vanish on a white card', () => {
    expect(techLogoFor('TypeScript 6.0')?.color).toBe('#3178C6');
    const drizzle = techLogoFor('Drizzle ORM')!.color; // 연두색 #C5F74F
    expect(drizzle).not.toBe('#C5F74F');
    expect(drizzle).toMatch(/^#[0-9A-F]{6}$/);
  });
});
