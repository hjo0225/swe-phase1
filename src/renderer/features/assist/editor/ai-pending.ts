import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { JobStatus } from '../../../../shared/ipc/assist';

/** 이 meta가 붙은 트랜잭션만 잠긴 범위를 바꿀 수 있다 (Commit, Mark 제거). */
export const AI_COMMIT_META = 'aiCommit';
export const PENDING_MARK = 'aiPending';

export interface PendingRange {
  from: number;
  to: number;
  /** 스냅샷 비교용 (BR-ASSIST-08). 요청 시점의 inputText도 같은 방식으로 읽는다. */
  text: string;
}

export interface AiPendingStorage {
  onRetry: ((jobId: string) => void) | null;
  onDismiss: ((jobId: string) => void) | null;
  failureLabel: ((jobId: string) => string) | null;
}

declare module '@tiptap/core' {
  interface Storage {
    aiPending: AiPendingStorage;
  }
}

const statusKey = new PluginKey<ReadonlyMap<string, JobStatus>>('aiPendingStatus');

/** 문서 안의 Pending Mark를 jobId별 범위로 모은다. 한 Job의 Mark가 여러 텍스트 노드에 나뉘어 있어도 하나의 범위다. */
export function findPendingRanges(doc: PMNode): Map<string, PendingRange> {
  const spans = new Map<string, { from: number; to: number }>();
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const mark = node.marks.find((m) => m.type.name === PENDING_MARK);
    const jobId = mark?.attrs.jobId as string | undefined;
    if (!jobId) return;
    const end = pos + node.nodeSize;
    const span = spans.get(jobId);
    spans.set(jobId, span ? { from: Math.min(span.from, pos), to: Math.max(span.to, end) } : { from: pos, to: end });
  });
  return new Map([...spans].map(([id, s]) => [id, { ...s, text: doc.textBetween(s.from, s.to, '\n') }]));
}

/** 요청 직전: 선택 범위를 잠그고 커서를 범위 끝으로 옮긴다 (Bubble Menu가 닫힌다). */
export function markPending(editor: Editor, jobId: string, range: { from: number; to: number }): void {
  editor.chain().setTextSelection(range).setMark(PENDING_MARK, { jobId }).setTextSelection(range.to).run();
}

/** 잠금을 풀고 원문을 그대로 둔다. */
export function removePending(editor: Editor, jobId: string): void {
  const range = findPendingRanges(editor.state.doc).get(jobId);
  if (!range) return;
  const markType = editor.schema.marks[PENDING_MARK]!;
  editor
    .chain()
    .setMeta(AI_COMMIT_META, true)
    .command(({ tr }) => {
      tr.removeMark(range.from, range.to, markType);
      return true;
    })
    .run();
}

/** Job 상태를 편집기에 알린다 → 잠금 여부와 표시(Pulse / 실패)가 바뀐다. 문서는 바뀌지 않는다. */
export function setJobStatuses(editor: Editor, statuses: ReadonlyMap<string, JobStatus>): void {
  editor.view.dispatch(editor.state.tr.setMeta(statusKey, statuses).setMeta('addToHistory', false));
}

const isLocked = (status: JobStatus | undefined) => status !== 'FAILED';

/**
 * Pending Mark (docs/backend/assist/domain-model.md "Pending Mark 규약").
 * 본문과 함께 저장되어 노트 전환·재시작 후에도 결과의 적용 위치를 잃지 않는다(D-03).
 */
export const AiPending = Mark.create<object, AiPendingStorage>({
  name: PENDING_MARK,
  // 범위 경계에서 입력한 글자가 Mark에 흡수되지 않게 한다.
  inclusive: false,

  addAttributes() {
    return {
      jobId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-job-id'),
        renderHTML: (attrs) => ({ 'data-job-id': attrs.jobId as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-ai-pending]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-ai-pending': '' }, HTMLAttributes), 0];
  },

  // .md 파일에는 HTML span으로 남긴다 (D-18). 읽을 때는 위 parseHTML 규칙이 Mark로 되돌린다.
  renderMarkdown: (node, helpers) =>
    `<span data-ai-pending data-job-id="${escapeAttribute(String(node.attrs?.jobId ?? ''))}">${helpers.renderChildren(node)}</span>`,

  addStorage() {
    return { onRetry: null, onDismiss: null, failureLabel: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<ReadonlyMap<string, JobStatus>>({
        key: statusKey,
        state: {
          init: () => new Map(),
          apply: (tr, value) => tr.getMeta(statusKey) ?? value,
        },
        // Selection Lock: 처리 중인 범위를 바꾸는 트랜잭션(입력·삭제·붙여넣기·Undo)을 거부한다.
        filterTransaction: (tr, state) => allowsTransaction(tr, state),
        props: {
          decorations(state) {
            const statuses = statusKey.getState(state) ?? new Map();
            const decorations: Decoration[] = [];
            for (const [jobId, range] of findPendingRanges(state.doc)) {
              const status = statuses.get(jobId);
              const failed = status === 'FAILED';
              decorations.push(
                Decoration.inline(range.from, range.to, {
                  class: failed ? 'ai-failed' : 'ai-processing',
                  'data-job-id': jobId,
                }),
              );
              if (failed) {
                decorations.push(
                  Decoration.widget(range.to, () => failureChip(jobId, storage), { side: 1, key: `fail-${jobId}` }),
                );
              }
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function allowsTransaction(tr: Transaction, state: EditorState): boolean {
  if (!tr.docChanged || tr.getMeta(AI_COMMIT_META)) return true;
  const statuses = statusKey.getState(state) ?? new Map<string, JobStatus>();
  let locked = [...findPendingRanges(state.doc)]
    .filter(([jobId]) => isLocked(statuses.get(jobId)))
    .map(([, r]) => ({ from: r.from, to: r.to }));
  if (locked.length === 0) return true;

  for (const step of tr.steps) {
    const map = step.getMap();
    let touches = false;
    map.forEach((oldStart, oldEnd) => {
      for (const r of locked) {
        const inside =
          oldStart === oldEnd ? oldStart > r.from && oldStart < r.to : oldStart < r.to && oldEnd > r.from;
        if (inside) touches = true;
      }
    });
    if (touches) return false;
    locked = locked.map((r) => ({ from: map.map(r.from, 1), to: map.map(r.to, -1) }));
  }
  return true;
}

function failureChip(jobId: string, storage: AiPendingStorage): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'ai-failure-chip';
  chip.contentEditable = 'false';
  chip.setAttribute('role', 'group');
  chip.setAttribute('aria-label', 'AI 작업 실패');

  const label = document.createElement('span');
  label.textContent = storage.failureLabel?.(jobId) ?? 'AI 작업에 실패했습니다';
  chip.append(label);

  for (const [text, handler] of [
    ['재시도', storage.onRetry],
    ['닫기', storage.onDismiss],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => handler?.(jobId));
    chip.append(button);
  }
  return chip;
}
