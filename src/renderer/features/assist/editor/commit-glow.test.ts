// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIJobView } from '../../../../shared/ipc/assist';
import { createEditorExtensions } from '../../editor/extensions';
import { applyCommit, planCommit } from '../commit/plan-commit';
import { markPending } from './ai-pending';
import { COMMIT_GLOW_MS } from './commit-glow';

const TARGET = '처리할 부분';

const job = (overrides: Partial<AIJobView>): AIJobView => ({
  id: 'job-1',
  noteId: 'n',
  type: 'ORGANIZE',
  status: 'COMPLETED',
  inputText: TARGET,
  attempt: 1,
  createdAt: '2026-09-30T00:00:00.000Z',
  result: { kind: 'MARKDOWN', markdown: '**정리됨** 결과' },
  ...overrides,
});

describe('commit glow (design-system "적용 완료")', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = new Editor({ extensions: createEditorExtensions(), content: `<p>앞 문장. ${TARGET}. 뒤 문장.</p>` });
    const from = 1 + editor.state.doc.textContent.indexOf(TARGET);
    markPending(editor, 'job-1', { from, to: from + TARGET.length });
  });
  afterEach(() => {
    editor.destroy();
    vi.useRealTimers();
  });

  const glowing = () => [...editor.view.dom.querySelectorAll('.ai-committed')].map((el) => el.textContent).join('');

  it('briefly highlights the replaced text, then clears', () => {
    applyCommit(editor, planCommit(editor.state.doc, 'job-1', job({}), new Set()));
    expect(glowing()).toBe('정리됨 결과');

    vi.advanceTimersByTime(COMMIT_GLOW_MS + 100);
    expect(editor.view.dom.querySelector('.ai-committed')).toBeNull();
  });

  it('highlights an inserted infographic block', () => {
    const spec = {
      version: 1,
      type: 'process',
      title: '과정',
      nodes: [
        { id: '1', title: 'a' },
        { id: '2', title: 'b' },
      ],
      edges: [['1', '2']],
    };
    applyCommit(
      editor,
      planCommit(
        editor.state.doc,
        'job-1',
        job({ type: 'VISUALIZE', result: { kind: 'INFOGRAPHIC', spec } as AIJobView['result'] }),
        new Set(),
      ),
    );
    const figure = editor.view.dom.querySelector('.ai-committed');
    expect(figure).not.toBeNull();
    expect(figure!.textContent).not.toContain(TARGET); // 원문이 아니라 새 블록
  });

  it('does not glow for discarded results', () => {
    applyCommit(editor, planCommit(editor.state.doc, 'job-1', undefined, new Set()));
    expect(editor.view.dom.querySelector('.ai-committed')).toBeNull();
  });
});
