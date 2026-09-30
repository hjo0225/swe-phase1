import { describe, expect, it } from 'vitest';
import { extractLinkTargets, linkTargetFor, resolveLinkTarget, rewriteLinkTargets } from './wiki-link';

const notes = [
  { id: 'root-meeting', path: '회의록.md' },
  { id: 'proj-meeting', path: '프로젝트/회의록.md' },
  { id: 'arch', path: '개발/Electron Architecture.md' },
  { id: 'deep', path: 'a/b/노트.md' },
];

describe('resolveLinkTarget', () => {
  it('prefers an exact path, then the shortest path with the same name', () => {
    expect(resolveLinkTarget('프로젝트/회의록', notes)?.id).toBe('proj-meeting');
    expect(resolveLinkTarget('회의록', notes)?.id).toBe('root-meeting');
    expect(resolveLinkTarget('Electron Architecture', notes)?.id).toBe('arch');
  });

  it('ignores case, surrounding spaces, a .md suffix, and #heading or ^block parts', () => {
    expect(resolveLinkTarget(' electron architecture ', notes)?.id).toBe('arch');
    expect(resolveLinkTarget('Electron Architecture.md', notes)?.id).toBe('arch');
    expect(resolveLinkTarget('Electron Architecture#Main Process', notes)?.id).toBe('arch');
    expect(resolveLinkTarget('회의록^abc123', notes)?.id).toBe('root-meeting');
  });

  it('matches partial folder paths from the end', () => {
    expect(resolveLinkTarget('b/노트', notes)?.id).toBe('deep');
  });

  it('returns null for unknown or empty targets', () => {
    expect(resolveLinkTarget('없는 노트', notes)).toBeNull();
    expect(resolveLinkTarget('  ', notes)).toBeNull();
  });
});

describe('linkTargetFor', () => {
  const paths = notes.map((n) => n.path);
  it('uses the bare name when it is unique in the vault, otherwise the path without .md', () => {
    expect(linkTargetFor('개발/Electron Architecture.md', paths)).toBe('Electron Architecture');
    expect(linkTargetFor('프로젝트/회의록.md', paths)).toBe('프로젝트/회의록');
  });
});

describe('extractLinkTargets', () => {
  it('reads targets from [[target]] and [[target|alias]] outside code', () => {
    const md = [
      '관련 내용은 [[Electron Architecture]] 와 [[프로젝트/회의록|지난 회의]] 참고',
      '`[[인라인 코드]]`',
      '```',
      '[[코드 블록]]',
      '```',
      '[[회의록#결정]]',
    ].join('\n');
    expect(extractLinkTargets(md)).toEqual(['Electron Architecture', '프로젝트/회의록', '회의록#결정']);
  });
});

describe('rewriteLinkTargets', () => {
  it('replaces only the target, keeping aliases, heading parts and code untouched', () => {
    const md = '[[회의록]], [[회의록|지난 회의]], [[회의록#결정]], [[다른 노트]]\n```\n[[회의록]]\n```';
    const rewritten = rewriteLinkTargets(md, (target) => (target === '회의록' ? '2026 회의록' : null));
    expect(rewritten).toBe('[[2026 회의록]], [[2026 회의록|지난 회의]], [[2026 회의록#결정]], [[다른 노트]]\n```\n[[회의록]]\n```');
  });

  it('returns the same string when nothing changes', () => {
    const md = '[[a]] text';
    expect(rewriteLinkTargets(md, () => null)).toBe(md);
  });
});
