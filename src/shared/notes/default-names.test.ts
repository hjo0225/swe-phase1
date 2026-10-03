import { describe, expect, it } from 'vitest';
import { isPlaceholderTitle, isUnsortedFolder, NEW_NOTE_TITLE, UNSORTED_FOLDER } from './default-names';

describe('default names', () => {
  it('names new notes and the unsorted folder in English', () => {
    expect(NEW_NOTE_TITLE).toBe('Untitled');
    expect(UNSORTED_FOLDER).toBe('Unsorted');
  });

  it.each(['Untitled', 'Untitled 2', '제목 없음', '제목 없음 3'])('treats %s as a placeholder title', (title) => {
    expect(isPlaceholderTitle(title)).toBe(true);
  });

  it.each(['Weekly Sync', 'Untitled notes', 'My Untitled'])('treats %s as a real title', (title) => {
    expect(isPlaceholderTitle(title)).toBe(false);
  });

  it('recognises the unsorted folder by its current and earlier (Korean) name', () => {
    expect(isUnsortedFolder('Unsorted')).toBe(true);
    expect(isUnsortedFolder('미분류')).toBe(true);
    expect(isUnsortedFolder('Study')).toBe(false);
  });
});
