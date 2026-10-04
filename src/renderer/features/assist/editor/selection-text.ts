import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';

/**
 * AI 작업에 보내는 선택 글 (inputText). 블록 하나 안의 선택은 그대로의 글이다.
 * 여러 블록에 걸치면 블록마다 한 줄로, 제목·목록·인용의 구조를 Markdown 표시(`## `, `- `, 들여쓰기, `> `)로 남긴다 —
 * 그냥 글만 보내면 정리된 Components 목록의 중첩(= 그룹)이 사라져 AI가 구조를 알 수 없다.
 * 요청 때와 적용 직전 비교(BR-ASSIST-08)가 같은 함수로 읽는다.
 */
export function selectionText(doc: PMNode, from: number, to: number): string {
  const $from = doc.resolve(from);
  if ($from.sameParent(doc.resolve(to)) && $from.parent.isTextblock) return doc.textBetween(from, to, '\n');
  const lines: string[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const text = doc.textBetween(Math.max(from, pos + 1), Math.min(to, pos + node.nodeSize - 1), '\n');
    // 빈 블록은 빈 줄로 남긴다 (textBetween과 같다)
    lines.push(text ? prefixOf(doc.resolve(pos), node) + text : '');
    return false;
  });
  return lines.join('\n');
}

/** 블록을 품은 목록·인용과 블록 자신(제목)의 표시 */
function prefixOf($pos: ResolvedPos, block: PMNode): string {
  let prefix = '';
  for (let d = 1; d <= $pos.depth; d++) {
    const node = $pos.node(d);
    if (node.type.name === 'blockquote') prefix += '> ';
    if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') continue;
    const list = $pos.node(d - 1);
    const index = $pos.index(d - 1);
    const marker = list.type.name === 'orderedList' ? `${((list.attrs.start as number | undefined) ?? 1) + index}. ` : '- ';
    // 목록 항목의 첫 블록에만 표시를 붙이고, 이어지는 블록은 표시 폭만큼 들여 쓴다
    const first = $pos.index(d) === 0 && d === $pos.depth;
    prefix += first ? marker : ' '.repeat(marker.length);
  }
  if (block.type.name === 'heading') prefix += `${'#'.repeat((block.attrs.level as number | undefined) ?? 1)} `;
  return prefix;
}
