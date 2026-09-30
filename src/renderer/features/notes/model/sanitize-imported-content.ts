import type { JSONContent } from '@tiptap/react';

/** 다른 노트에서 가져온 본문에 남으면 안 되는 Mark. Pending Mark는 자기 노트의 Job만 가리켜야 한다 (BR-ASSIST-06). */
const FOREIGN_MARKS = new Set(['aiPending']);

/** 내용 가져오기 전에 노드 목록을 정리한 복사본을 만든다. 입력은 바꾸지 않는다. */
export function sanitizeImportedContent(nodes: JSONContent[]): JSONContent[] {
  return nodes.map(sanitizeNode);
}

function sanitizeNode(node: JSONContent): JSONContent {
  const copy: JSONContent = { ...node };
  if (node.marks) {
    const marks = node.marks.filter((mark) => !FOREIGN_MARKS.has(mark.type));
    if (marks.length > 0) copy.marks = marks;
    else delete copy.marks;
  }
  if (node.content) copy.content = node.content.map(sanitizeNode);
  return copy;
}
