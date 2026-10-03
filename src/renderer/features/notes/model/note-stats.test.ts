import { describe, expect, it } from 'vitest';
import { countCharacters, formatNoteStats, readingMinutes } from './note-stats';

describe('note stats (제목 아래 정보 줄)', () => {
  it('counts characters without line breaks', () => {
    expect(countCharacters('가나다\n\n라마 바')).toBe(7); // 공백은 세고 줄바꿈은 세지 않는다
  });

  it('estimates reading time at about 500 Korean characters a minute, at least one minute', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(120)).toBe(1);
    expect(readingMinutes(1240)).toBe(3);
  });

  it('builds the line from the update time, length and reading time', () => {
    const now = new Date(2026, 9, 3, 18, 0);
    expect(formatNoteStats({ updatedAt: new Date(2026, 9, 3, 17, 58).toISOString(), characters: 1240 }, now)).toBe(
      'Edited 2 min ago · 1,240 chars · 3 min read',
    );
    expect(formatNoteStats({ updatedAt: new Date(2026, 8, 30, 9, 5).toISOString(), characters: 0 }, now)).toBe('Edited Sep 30');
  });
});
