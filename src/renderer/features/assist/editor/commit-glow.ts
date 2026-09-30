import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** 적용 완료 표시 시간 (docs/frontend/design-system.md "Commit glow 600ms"). CSS 애니메이션과 맞춘다. */
export const COMMIT_GLOW_MS = 600;

type GlowMeta = { add: { id: number; from: number; to: number } } | { remove: number };

const glowKey = new PluginKey<DecorationSet>('aiCommitGlow');
let nextGlowId = 1;

/**
 * AI 결과가 들어간 자리를 잠깐 Mint로 빛낸다. 문서는 바꾸지 않는 장식이라 저장·Undo에 남지 않는다.
 * 범위가 블록 하나(인포그래픽)면 그 블록을, 아니면 글자 범위를 감싼다.
 */
export const CommitGlow = Extension.create({
  name: 'aiCommitGlow',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: glowKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(glowKey) as GlowMeta | undefined;
            if (meta && 'add' in meta) {
              const { id, from, to } = meta.add;
              const node = tr.doc.nodeAt(from);
              const spec = { glowId: id };
              const decoration =
                node?.isBlock && from + node.nodeSize === to
                  ? Decoration.node(from, to, { class: 'ai-committed' }, spec)
                  : Decoration.inline(from, to, { class: 'ai-committed' }, spec);
              next = next.add(tr.doc, [decoration]);
            } else if (meta && 'remove' in meta) {
              next = next.remove(next.find(undefined, undefined, (s) => (s as { glowId?: number }).glowId === meta.remove));
            }
            return next;
          },
        },
        props: {
          decorations: (state) => glowKey.getState(state),
        },
      }),
    ];
  },
});

/** [from, to)를 COMMIT_GLOW_MS 동안 빛낸다. */
export function glowRange(editor: Editor, range: { from: number; to: number }): void {
  if (range.to <= range.from) return;
  const id = nextGlowId++;
  const add: GlowMeta = { add: { id, ...range } };
  editor.view.dispatch(editor.state.tr.setMeta(glowKey, add).setMeta('addToHistory', false));
  setTimeout(() => {
    if (editor.isDestroyed) return;
    const remove: GlowMeta = { remove: id };
    editor.view.dispatch(editor.state.tr.setMeta(glowKey, remove).setMeta('addToHistory', false));
  }, COMMIT_GLOW_MS);
}
