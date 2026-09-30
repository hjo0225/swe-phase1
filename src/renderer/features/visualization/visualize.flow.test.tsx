// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { resetToastsForTests } from '../../shared/ui/toast';
import { resetAutosaveForTests } from '../notes/autosave/autosave';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const editorOf = () => (screen.getByRole('textbox', { name: '노트 본문' }) as HTMLElement & { editor: Editor }).editor;

async function runAction(text: string, target: string, action: RegExp) {
  const user = userEvent.setup();
  await getBlink().settings.updateProvider({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'sk' });
  const note = await getBlink().notes.create({ title: '메모', content: doc(text) });
  window.location.hash = `#/notes/${note.id}`;
  render(<App />);
  await screen.findByRole('textbox', { name: '노트 본문' });
  const editor = editorOf();
  const from = 1 + editor.state.doc.textContent.indexOf(target);
  act(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from, to: from + target.length });
  });
  const bubble = await screen.findByRole('toolbar', { name: 'AI 작업' });
  await waitFor(() => expect(within(bubble).getByRole('button', { name: action })).toBeEnabled());
  await user.click(within(bubble).getByRole('button', { name: action }));
  return { user, note };
}

describe('visualize and expand', () => {
  beforeEach(() => {
    resetBlinkForTests({ aiDelayMs: 100 });
    resetAutosaveForTests();
    resetToastsForTests();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('keeps the original text and inserts the infographic below it', async () => {
    const { user, note } = await runAction('노트를 쓰면 AI가 분석해서 결과를 만든다', '노트를 쓰면 AI가 분석해서 결과를 만든다', /시각화/);

    const figure = await screen.findByRole('figure', { name: '처리 과정' }, { timeout: 3000 });
    const body = screen.getByRole('textbox', { name: '노트 본문' });
    expect(body).toHaveTextContent('노트를 쓰면 AI가 분석해서 결과를 만든다');
    expect(body.querySelector('.ai-processing')).toBeNull();
    expect(within(figure).getByText('입력')).toBeInTheDocument();
    expect(within(figure).getByText('결과')).toBeInTheDocument();

    // PNG 저장 버튼은 Main으로 PNG를 보낸다 (Mock은 경로를 돌려준다)
    expect(within(figure).getByRole('button', { name: 'PNG로 저장' })).toBeInTheDocument();

    // 인포그래픽은 본문(JSON)에 Spec으로 저장된다
    await waitFor(
      async () => expect(JSON.stringify((await getBlink().notes.get({ id: note.id })).content)).toContain('"type":"infographic"'),
      { timeout: 3000 },
    );

    await user.click(within(figure).getByRole('button', { name: '인포그래픽 삭제' }));
    expect(screen.queryByRole('figure', { name: '처리 과정' })).not.toBeInTheDocument();
  });

  it('replaces the selection with researched text followed by its sources', async () => {
    await runAction('Electron은 데스크톱 앱 프레임워크다', 'Electron은 데스크톱 앱 프레임워크다', /구체화/);
    const body = screen.getByRole('textbox', { name: '노트 본문' });
    await waitFor(() => expect(body).toHaveTextContent('(구체화됨)'), { timeout: 3000 });
    expect(within(body).getByText('출처')).toBeInTheDocument();
    expect(within(body).getByRole('link', { name: '예시 출처' })).toHaveAttribute('href', 'https://example.com/');
  });

  it('shows a placeholder instead of crashing on an invalid stored spec', async () => {
    const note = await getBlink().notes.create({
      title: '깨진 인포그래픽',
      content: { type: 'doc', content: [{ type: 'infographic', attrs: { spec: { type: 'nope' } } }] },
    });
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    expect(await screen.findByText('표시할 수 없는 인포그래픽입니다')).toBeInTheDocument();
  });
});
