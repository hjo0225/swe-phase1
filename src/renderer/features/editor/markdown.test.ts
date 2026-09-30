// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './extensions';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

const open = (markdown: string) => {
  editor = new Editor({ extensions: createEditorExtensions(), content: markdown, contentType: 'markdown' });
  return editor;
};
const nodesOf = (e: Editor, type: string) => {
  const found: Record<string, unknown>[] = [];
  e.state.doc.descendants((node) => {
    if (node.type.name === type) found.push(node.attrs);
  });
  return found;
};

describe('note markdown (D-15, D-18)', () => {
  it('reads [[target]] and [[target|label]] as note links and writes them back unchanged', () => {
    const e = open('회의는 [[프로젝트/계획|계획서]] 참고, [[회고]]도.');
    expect(nodesOf(e, 'noteLink')).toEqual([
      { target: '프로젝트/계획', label: '계획서' },
      { target: '회고', label: '' },
    ]);
    expect(e.getMarkdown()).toBe('회의는 [[프로젝트/계획|계획서]] 참고, [[회고]]도.');
  });

  it('keeps [[...]] inside code as text', () => {
    const e = open('`[[코드]]` 는 링크가 아님');
    expect(nodesOf(e, 'noteLink')).toEqual([]);
  });

  it('round-trips the AI pending mark as an HTML span', () => {
    const md = '앞 <span data-ai-pending data-job-id="job-1">처리할 부분</span> 뒤';
    const e = open(md);
    let jobId: unknown;
    e.state.doc.descendants((node) => {
      const mark = node.marks.find((m) => m.type.name === 'aiPending');
      if (mark) jobId = mark.attrs.jobId;
    });
    expect(jobId).toBe('job-1');
    expect(e.getMarkdown()).toBe(md);
  });

  it('round-trips an infographic as a blink-infographic code block', () => {
    const spec = { version: 1, type: 'steps', title: '흐름', items: [{ label: '하나' }] };
    const md = `# 제목\n\n\`\`\`blink-infographic\n${JSON.stringify(spec, null, 2)}\n\`\`\`\n\n본문`;
    const e = open(md);
    expect(nodesOf(e, 'infographic')).toEqual([{ spec }]);
    expect(nodesOf(e, 'codeBlock')).toEqual([]);
    expect(e.getMarkdown()).toBe(md);
  });

  it('leaves other code blocks alone', () => {
    const e = open('```ts\nconst a = 1;\n```');
    expect(nodesOf(e, 'codeBlock')).toHaveLength(1);
    expect(e.getMarkdown()).toBe('```ts\nconst a = 1;\n```');
  });
});
