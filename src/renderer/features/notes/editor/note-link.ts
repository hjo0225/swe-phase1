import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';
import { formatWikiLink, wikiLinkAtStart } from '../../../../shared/notes/wiki-link';
import { NoteLinkView } from './NoteLinkView';

export interface NoteLinkAttrs {
  /** `[[대상]]`의 대상 — 노트 이름 또는 보관함 기준 경로(.md 제외) */
  target: string;
  /** `[[대상|별칭]]`의 별칭. 없으면 '' */
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

const TOKEN = 'noteLink';

/**
 * `[[다른 노트]]` 참조 (D-15). 파일에는 옵시디언과 같은 `[[대상|별칭]]` 그대로 저장되고,
 * 대상 해석은 Shared Kernel(wiki-link)이 Main과 같은 규칙으로 한다.
 */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-target') ?? '',
        renderHTML: (attrs) => ({ 'data-target': attrs.target as string }),
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
    return ['span', mergeAttributes({ 'data-note-link': '' }, HTMLAttributes), formatWikiLink(node.attrs.target, node.attrs.label)];
  },

  renderText({ node }) {
    return formatWikiLink(node.attrs.target as string, node.attrs.label as string);
  },

  markdownTokenName: TOKEN,
  markdownTokenizer: {
    name: TOKEN,
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenize: (src) => {
      const link = wikiLinkAtStart(src);
      return link ? { type: TOKEN, raw: link.raw, target: link.target, label: link.label } : undefined;
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode('noteLink', { target: token.target as string, label: token.label as string }),
  renderMarkdown: (node) => formatWikiLink(node.attrs?.target as string, node.attrs?.label as string),

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
