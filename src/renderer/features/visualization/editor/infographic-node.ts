import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';
import { InfographicView } from './InfographicView';

const TOKEN = 'blinkInfographic';
const FENCE = 'blink-infographic';
const BLOCK = /^```blink-infographic[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/;

/**
 * VISUALIZE 결과 블록. Spec을 속성으로 품는다(D-05) — 내용 가져오기로 복사해도 고아 레코드가 없다.
 * .md 파일에는 ```blink-infographic 코드 블록(JSON)으로 저장한다 (D-18). 다른 앱에서는 코드 블록으로 보인다.
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

  markdownTokenName: TOKEN,
  markdownTokenizer: {
    name: TOKEN,
    level: 'block',
    start: (src) => src.indexOf('```blink-infographic'),
    tokenize: (src) => {
      const match = BLOCK.exec(src);
      return match ? { type: TOKEN, raw: match[0], text: match[1] } : undefined;
    },
  },
  parseMarkdown: (token, helpers) => {
    const text = token.text ?? '';
    try {
      return helpers.createNode('infographic', { spec: JSON.parse(text) as unknown });
    } catch {
      // 손으로 고쳐 JSON이 깨졌으면 내용을 잃지 않도록 코드 블록으로 둔다.
      return helpers.createNode('codeBlock', { language: FENCE }, [helpers.createTextNode(text)]);
    }
  },
  renderMarkdown: (node) => `\`\`\`${FENCE}\n${JSON.stringify(node.attrs?.spec ?? null, null, 2)}\n\`\`\``,

  addNodeView() {
    return ReactNodeViewRenderer(InfographicView);
  },
});
