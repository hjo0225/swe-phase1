import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';
import { NoteLinkView } from './NoteLinkView';

export interface NoteLinkAttrs {
  noteId: string;
  /** 삽입 시점의 제목. 대상 제목이 바뀌면 화면은 현재 제목을 보여 준다. */
  label: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      /** 현재 선택의 끝(커서)에 링크를 넣는다. 선택된 텍스트를 지우지 않는다. */
      insertNoteLink: (attrs: NoteLinkAttrs) => ReturnType;
    };
  }
}

/**
 * `[[다른 노트]]` 참조. 이름과 속성은 백엔드 계약(docs/backend/note/api-contract.md)을 따른다 —
 * Main이 저장 시 이 노드에서 링크 집합을 파생한다(D-02).
 */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-note-id'),
        renderHTML: (attrs) => ({ 'data-note-id': attrs.noteId as string }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs) => ({ 'data-label': attrs.label as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-note-link': '' }, HTMLAttributes), `[[${node.attrs.label as string}]]`];
  },

  renderText({ node }) {
    return `[[${node.attrs.label as string}]]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView);
  },

  addCommands() {
    return {
      insertNoteLink:
        (attrs) =>
        ({ chain, state }) =>
          chain()
            .insertContentAt(state.selection.to, [
              { type: this.name, attrs },
              { type: 'text', text: ' ' },
            ])
            .run(),
    };
  },
});
