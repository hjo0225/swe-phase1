import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';
import { InfographicView } from './InfographicView';

/**
 * VISUALIZE 결과 블록. Spec을 속성으로 품는다(D-05) — 내용 가져오기로 복사해도 고아 레코드가 없다.
 * Main은 이 노드를 해석하지 않고 본문의 일부로 저장만 한다.
 */
export const Infographic = Node.create({
  name: 'infographic',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      spec: {
        default: null,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-spec') ?? 'null') as unknown;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) => ({ 'data-spec': JSON.stringify(attrs.spec) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-infographic]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes({ 'data-infographic': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InfographicView);
  },
});
