import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './markdown-content';
import { FolderName, NoteName, uniqueName } from './names';
import { FolderPath, NotePath } from './note-path';

describe('NotePath', () => {
  it('normalizes separators and exposes name, folder and link target', () => {
    const path = NotePath.of('프로젝트\\2026\\회의록.md');
    expect(path.value).toBe('프로젝트/2026/회의록.md');
    expect(path.name).toBe('회의록');
    expect(path.folder).toBe('프로젝트/2026');
    expect(path.linkTarget).toBe('프로젝트/2026/회의록');
    expect(NotePath.of('회의록.md').folder).toBe('');
  });

  it('builds renamed and moved paths', () => {
    const path = NotePath.of('a/회의록.md');
    expect(path.withName(NoteName.of('결정')).value).toBe('a/결정.md');
    expect(path.inFolder(FolderPath.of('b/c')).value).toBe('b/c/회의록.md');
    expect(path.inFolder(FolderPath.root()).value).toBe('회의록.md');
    expect(NotePath.in(FolderPath.of('x'), NoteName.of('새 노트')).value).toBe('x/새 노트.md');
  });

  it('rejects escapes, absolute paths, hidden folders and non-markdown files', () => {
    for (const bad of ['../x.md', '/abs.md', 'C:/abs.md', '.git/x.md', 'a/.obsidian/x.md', 'a/b.txt', 'node_modules/x.md']) {
      expect(() => NotePath.of(bad), bad).toThrow();
    }
  });
});

describe('FolderPath', () => {
  it('normalizes and knows its parent and name', () => {
    const folder = FolderPath.of('/a\\b/');
    expect(folder.value).toBe('a/b');
    expect(folder.name).toBe('b');
    expect(folder.parent.value).toBe('a');
    expect(FolderPath.root().isRoot).toBe(true);
    expect(folder.child(FolderName.of('c')).value).toBe('a/b/c');
    expect(folder.contains('a/b/c/x.md')).toBe(true);
    expect(folder.contains('a/bc/x.md')).toBe(false);
  });
});

describe('NoteName / FolderName', () => {
  it('trims and accepts ordinary names', () => {
    expect(NoteName.of('  2026 회의록  ').value).toBe('2026 회의록');
  });

  it.each(['', '   ', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', '.hidden', 'end.', 'x'.repeat(201)])(
    'rejects %j',
    (bad) => {
      expect(() => NoteName.of(bad)).toThrow(expect.objectContaining({ code: 'NOTE_TITLE_INVALID' }));
      expect(() => FolderName.of(bad)).toThrow(expect.objectContaining({ code: 'FOLDER_NAME_INVALID' }));
    },
  );

  it('picks a free name by numbering, case-insensitively', () => {
    expect(uniqueName('제목 없음', new Set())).toBe('제목 없음');
    expect(uniqueName('제목 없음', new Set(['제목 없음', '제목 없음 1']))).toBe('제목 없음 2');
    expect(uniqueName('Note', new Set(['note']))).toBe('Note 1');
  });
});

describe('MarkdownContent', () => {
  it('extracts searchable plain text following BR-NOTE-08', () => {
    const md = [
      '---',
      'tags: [meeting]',
      '---',
      '# 회의 결과',
      '',
      '- **Electron** 쓸 거 같고 `sqlite` 사용',
      '1. [공식 문서](https://electronjs.org) 참고',
      '> 인용 [[Electron Architecture|아키텍처]] 와 [[회의록]]',
      '<span data-ai-pending="job-1">처리 중인 문장</span>',
      '',
      '```blink-infographic',
      '{"title": "숨김"}',
      '```',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');
    expect(MarkdownContent.fromMarkdown(md).plainText).toBe(
      '회의 결과\nElectron 쓸 거 같고 sqlite 사용\n공식 문서 참고\n인용 아키텍처 와 회의록\n처리 중인 문장\nconst x = 1;',
    );
  });

  it('collects link targets outside code', () => {
    const content = MarkdownContent.fromMarkdown('[[A]] [[b/B|별칭]] `[[C]]`');
    expect(content.linkTargets).toEqual(['A', 'b/B']);
  });

  it('rejects documents larger than 2 MB', () => {
    expect(() => MarkdownContent.fromMarkdown('가'.repeat(700_000))).toThrow(
      expect.objectContaining({ code: 'NOTE_CONTENT_TOO_LARGE' }),
    );
  });

  it('compares by markdown text', () => {
    expect(MarkdownContent.fromMarkdown('a').equals(MarkdownContent.fromMarkdown('a'))).toBe(true);
  });
});
