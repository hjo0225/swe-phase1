import { extractLinkTargets } from '../../../shared/notes/wiki-link';
import { DomainError } from '../../platform/errors';

const MAX_BYTES = 2 * 1024 * 1024;
const INFOGRAPHIC_LANG = 'blink-infographic';

/**
 * 노트 본문 = Markdown 문자열 (D-14). 편집기 문서 구조는 모른다.
 * 검색용 텍스트(BR-NOTE-08)와 `[[링크]]` 대상만 뽑는다.
 */
export class MarkdownContent {
  private constructor(
    readonly markdown: string,
    readonly plainText: string,
    readonly linkTargets: readonly string[],
  ) {}

  static fromMarkdown(markdown: string): MarkdownContent {
    if (new TextEncoder().encode(markdown).byteLength > MAX_BYTES) {
      throw new DomainError('NOTE_CONTENT_TOO_LARGE', 'Content exceeds 2 MB', { maxBytes: MAX_BYTES });
    }
    return new MarkdownContent(markdown, toPlainText(markdown), extractLinkTargets(markdown));
  }

  equals(other: MarkdownContent): boolean {
    return this.markdown === other.markdown;
  }
}

function toPlainText(markdown: string): string {
  const source = markdown.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---(\n|$)/, '');
  const lines: string[] = [];
  let fence: { marker: string; keep: boolean } | null = null;

  for (const line of source.split('\n')) {
    const open = line.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)/);
    if (fence) {
      if (open && open[1]![0] === fence.marker && line.trim() === open[1]) fence = null;
      else if (fence.keep) lines.push(line);
      continue;
    }
    if (open) {
      // 인포그래픽 블록은 JSON이라 검색에서 뺀다. 일반 코드는 내용을 남긴다.
      fence = { marker: open[1]![0]!, keep: open[2] !== INFOGRAPHIC_LANG };
      continue;
    }
    lines.push(inlineText(blockText(line)));
  }

  return lines
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function blockText(line: string): string {
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return ''; // 구분선
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '') // 제목
    .replace(/^\s*(>\s?)+/, '') // 인용
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''); // 목록·할 일
}

function inlineText(line: string): string {
  return line
    .replace(/<span data-ai-pending="[^"]*">|<\/span>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 이미지
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*?))?\]\]/g, (_m, target: string, alias?: string) =>
      (alias ?? target.split(/[#^]/)[0]!).trim(),
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크
    .replace(/`([^`]*)`/g, '$1') // 인라인 코드
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?:;]|$)/g, '$1$2');
}
