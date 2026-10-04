import { describe, expect, it } from 'vitest';
import { startsWithTopLevelHeading } from './print-title';

describe('startsWithTopLevelHeading', () => {
  it('detects a body that opens with a level-1 heading, after blank lines too', () => {
    expect(startsWithTopLevelHeading('# 연구 개요\n\n본문')).toBe(true);
    expect(startsWithTopLevelHeading('\n\n  #   Poster')).toBe(true);
    expect(startsWithTopLevelHeading('Poster\n===\n\n본문')).toBe(true);
  });

  it('keeps the title for anything else', () => {
    expect(startsWithTopLevelHeading('## 방법\n\n본문')).toBe(false);
    expect(startsWithTopLevelHeading('본문\n\n# 나중 제목')).toBe(false);
    expect(startsWithTopLevelHeading('#해시태그로 시작')).toBe(false);
    expect(startsWithTopLevelHeading('```\n# 코드\n```')).toBe(false);
    expect(startsWithTopLevelHeading('')).toBe(false);
  });
});
