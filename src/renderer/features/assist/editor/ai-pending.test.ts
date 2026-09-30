// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AIJobView } from '../../../../shared/ipc/assist';
import { createEditorExtensions } from '../../editor/extensions';
import { applyCommit, planCommit } from '../commit/plan-commit';
import { AI_COMMIT_META, findPendingRanges, markPending, setJobStatuses } from './ai-pending';

const TARGET = '처리할 부분';

function setup() {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: `<p>앞 문장. ${TARGET}. 뒤 문장.</p>`,
  });
  const text = editor.state.doc.textContent;
  const from = 1 + text.indexOf(TARGET);
  const to = from + TARGET.length;
  return { editor, from, to };
}

const job = (overrides: Partial<AIJobView>): AIJobView => ({
  id: 'job-1',
  noteId: 'n',
  type: 'ORGANIZE',
  status: 'COMPLETED',
  inputText: TARGET,
  attempt: 1,
  createdAt: '2026-09-30T00:00:00.000Z',
  result: { kind: 'MARKDOWN', markdown: '**정리됨**' },
  ...overrides,
});

describe('aiPending mark and selection lock', () => {
  let editor: Editor;
  let from: number;
  let to: number;

  beforeEach(() => {
    ({ editor, from, to } = setup());
    markPending(editor, 'job-1', { from, to });
  });
  afterEach(() => editor.destroy());

  it('marks the range and finds it with its text', () => {
    expect(findPendingRanges(editor.state.doc).get('job-1')).toEqual({ from, to, text: TARGET });
  });

  it('rejects edits inside a locked range but allows edits outside and at its edges', () => {
    expect(editor.commands.insertContentAt(from + 2, 'X')).toBe(true); // 명령은 실행되지만
    expect(editor.state.doc.textContent).toContain(TARGET); // 트랜잭션은 거부된다
    editor.commands.insertContentAt(to + 1, '!');
    editor.commands.insertContentAt(from, '>');
    expect(editor.state.doc.textContent).toBe(`앞 문장. >${TARGET}.! 뒤 문장.`);
  });

  it('rejects deleting across the locked range', () => {
    editor.commands.deleteRange({ from: from - 2, to: from + 2 });
    expect(editor.state.doc.textContent).toContain(TARGET);
  });

  it('lets commit transactions through', () => {
    editor.chain().setMeta(AI_COMMIT_META, true).insertContentAt({ from, to }, '교체').run();
    expect(editor.state.doc.textContent).toBe('앞 문장. 교체. 뒤 문장.');
  });

  it('unlocks failed jobs and shows their state', () => {
    setJobStatuses(editor, new Map([['job-1', 'FAILED']]));
    editor.commands.insertContentAt(from + 2, 'X');
    expect(editor.state.doc.textContent).not.toContain(TARGET);
    expect(editor.view.dom.querySelector('.ai-failed')).not.toBeNull();
  });

  it('pulses while the job is unknown or running', () => {
    expect(editor.view.dom.querySelector('.ai-processing')?.textContent).toBe(TARGET);
  });
});

describe('planCommit / applyCommit', () => {
  let editor: Editor;
  let from: number;
  let to: number;

  beforeEach(() => {
    ({ editor, from, to } = setup());
    markPending(editor, 'job-1', { from, to });
  });
  afterEach(() => editor.destroy());

  const plan = (j: AIJobView | undefined, requested = new Set<string>()) =>
    planCommit(editor.state.doc, 'job-1', j, requested);

  it('waits while the job runs or is still being requested', () => {
    expect(plan(job({ status: 'RUNNING', result: undefined })).kind).toBe('wait');
    expect(plan(undefined, new Set(['job-1'])).kind).toBe('wait');
  });

  it('keeps the mark for failed jobs', () => {
    expect(plan(job({ status: 'FAILED', result: undefined })).kind).toBe('markFailed');
  });

  it('replaces the range with the parsed markdown result in one step and drops the mark', () => {
    const p = plan(job({}));
    expect(p).toMatchObject({ kind: 'replace', range: { from, to }, markdown: '**정리됨**' });
    applyCommit(editor, p);
    expect(editor.state.doc.textContent).toBe('앞 문장. 정리됨. 뒤 문장.');
    expect(editor.getHTML()).toContain('<strong>정리됨</strong>');
    expect(findPendingRanges(editor.state.doc).size).toBe(0);
  });

  it('leaves the user’s cursor where they are writing when a result lands elsewhere', () => {
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(end);
    applyCommit(editor, plan(job({})));
    const { from: cursor } = editor.state.selection;
    expect(editor.state.doc.textBetween(cursor - 3, cursor)).toBe('문장.');
    editor.commands.insertContent('!');
    expect(editor.state.doc.textContent).toBe('앞 문장. 정리됨. 뒤 문장.!');
  });

  it('discards the result when the range text no longer matches the snapshot', () => {
    setJobStatuses(editor, new Map([['job-1', 'FAILED']])); // 잠금 해제 후 편집
    editor.commands.insertContentAt(from + 1, 'Z');
    const p = plan(job({}));
    expect(p).toMatchObject({ kind: 'discard', reason: 'changed' });
    applyCommit(editor, p);
    expect(findPendingRanges(editor.state.doc).size).toBe(0);
    expect(editor.state.doc.textContent).toContain('Z');
  });

  it('discards silently when the job no longer exists, and does nothing without a mark', () => {
    expect(plan(undefined)).toMatchObject({ kind: 'discard', reason: 'missing' });
    expect(planCommit(editor.state.doc, 'other', job({}), new Set()).kind).toBe('none');
  });
});
