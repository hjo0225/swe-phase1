import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

const now = new Date(2026, 8, 30, 15, 30, 0);
const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe('formatRelativeTime', () => {
  it.each([
    [new Date(2026, 8, 30, 15, 29, 40).toISOString(), 'just now'],
    [at(2026, 8, 30, 15, 29), '1 min ago'],
    [at(2026, 8, 30, 15, 5), '25 min ago'],
    [at(2026, 8, 30, 9, 7), '09:07'],
    [at(2026, 8, 29, 23, 59), 'Sep 29'],
    [at(2025, 11, 31, 10, 0), 'Dec 31, 2025'],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });
});
