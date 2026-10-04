import type { Editor, JSONContent } from '@tiptap/core';

/**
 * 가져온 노트 내용을 커서 자리에 넣고, 커서를 그 아래 맨 바깥의 새 줄로 옮긴다.
 * 그대로 두면 커서가 가져온 내용의 마지막 블록(예: 목록의 마지막 항목) 안에 남아, 이어서 가져온 노트가 그 목록 안으로 들어간다.
 */
export function insertImportedContent(editor: Editor, content: JSONContent[]): void {
  editor.chain().focus().insertContentAt(editor.state.selection.to, content).run();
  const { $to } = editor.state.selection;
  if ($to.depth === 0) return;
  // 커서가 있는 맨 바깥 블록 바로 뒤
  const after = $to.after(1);
  const next = editor.state.doc.nodeAt(after);
  if (next?.type.name === 'paragraph' && next.content.size === 0) {
    editor.chain().setTextSelection(after + 1).run(); // 이미 빈 줄이 있으면 거기로
    return;
  }
  editor.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run();
}
