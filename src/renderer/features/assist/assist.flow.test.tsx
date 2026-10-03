// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetToastsForTests } from '../../shared/ui/toast';
import { resetAutosaveForTests } from '../notes/autosave/autosave';


const editorOf = () => (screen.getByRole('textbox', { name: 'Note body' }) as HTMLElement & { editor: Editor }).editor;

async function openNoteWith(text: string) {
  const note = await seedNote('메모', text);
  window.location.hash = `#/notes/${note.id}`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Note body' });
  return note;
}

function select(target: string) {
  const editor = editorOf();
  const from = 1 + editor.state.doc.textContent.indexOf(target);
  act(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from, to: from + target.length });
  });
}

const configure = (model = 'gpt-5.4-mini') => getBlink().settings.updateProvider({ provider: 'openai', model, apiKey: 'sk-test' });

describe('AI settings', () => {
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
    resetToastsForTests();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('tests the connection with the typed key and saves the provider', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings/ai';
    render(<App />);

    const form = await screen.findByRole('form', { name: 'AI settings' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Model' }), 'gpt-5.4-mini');
    await user.type(within(form).getByLabelText('API Key'), 'sk-test');
    await user.click(within(form).getByRole('button', { name: 'Test connection' }));
    expect(await within(form).findByText('Connected')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('OpenAI · GPT-5.4 mini (recommended)')).toBeInTheDocument();
    expect(within(form).getByLabelText('API Key')).toHaveValue('');
    expect(within(form).getByLabelText('API Key')).toHaveAttribute('placeholder', 'Saved · enter a new key to replace it');
  });

  it('switches the active provider to Kimi', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings/ai';
    render(<App />);

    const form = await screen.findByRole('form', { name: 'AI settings' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Provider' }), 'kimi');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Model' }), 'kimi-k2.6');
    expect(within(form).getByPlaceholderText(/api\.moonshot\.ai/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText('API Key'), 'sk-kimi');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Kimi · Kimi K2.6 (recommended)')).toBeInTheDocument();
  });

  it('reports a failed connection test', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings/ai';
    render(<App />);
    const form = await screen.findByRole('form', { name: 'AI settings' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Model' }), 'gpt-5.4-mini');
    await user.type(within(form).getByLabelText('API Key'), 'bad-key');
    await user.click(within(form).getByRole('button', { name: 'Test connection' }));
    expect(await within(form).findByText('Check your API key')).toBeInTheDocument();
  });
});

describe('AI actions on selected text', () => {
  beforeEach(() => {
    resetBlinkForTests({ aiDelayMs: 150 });
    resetAutosaveForTests();
    resetToastsForTests();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('disables actions until AI is configured', async () => {
    await openNoteWith('회의했고 api 얘기함');
    select('회의했고');
    const bubble = await screen.findByRole('toolbar', { name: 'AI actions' });
    expect(within(bubble).getByRole('button', { name: /Organize/ })).toBeDisabled();
    expect(within(bubble).getByText('AI not set up')).toBeInTheDocument();
  });

  it('locks 구체화 when the model has no web search', async () => {
    await configure('gpt-5.4-nano');
    await openNoteWith('Electron은 프레임워크다');
    select('Electron');
    const bubble = await screen.findByRole('toolbar', { name: 'AI actions' });
    await waitFor(() => expect(within(bubble).getByRole('button', { name: /Expand/ })).toBeDisabled());
    expect(within(bubble).getByRole('button', { name: /Organize/ })).toBeEnabled();
  });

  it('organizes the selection: pulse while running, then one atomic replacement that gets saved', async () => {
    const user = userEvent.setup();
    await configure();
    const note = await openNoteWith('앞 문장. 회의했고 api 얘기함. 뒤 문장.');
    select('회의했고 api 얘기함');

    const bubble = await screen.findByRole('toolbar', { name: 'AI actions' });
    await waitFor(() => expect(within(bubble).getByRole('button', { name: /Organize/ })).toBeEnabled());
    await user.click(within(bubble).getByRole('button', { name: /Organize/ }));

    const body = screen.getByRole('textbox', { name: 'Note body' });
    await waitFor(() => expect(body.querySelector('.ai-processing')).toHaveTextContent('회의했고 api 얘기함'));

    await waitFor(() => expect(body).toHaveTextContent('정리된 메모'), { timeout: 3000 });
    expect(body.querySelector('.ai-processing')).toBeNull();
    expect(body).toHaveTextContent('앞 문장.');
    await waitFor(
      async () => expect(JSON.stringify((await getBlink().notes.get({ id: note.id })).content)).toContain('정리된 메모'),
      { timeout: 3000 },
    );
  });

  it('shows a failure chip, keeps the original, and retries', async () => {
    const user = userEvent.setup();
    await configure();
    await openNoteWith('느린 요청 #fail:TIMEOUT 입니다');
    select('느린 요청 #fail:TIMEOUT');

    await user.click(within(await screen.findByRole('toolbar', { name: 'AI actions' })).getByRole('button', { name: /Organize/ }));
    const chip = await screen.findByRole('group', { name: 'AI job failed' }, { timeout: 3000 });
    expect(chip).toHaveTextContent('The response took too long');
    expect(screen.getByRole('textbox', { name: 'Note body' })).toHaveTextContent('느린 요청 #fail:TIMEOUT');

    await user.click(within(chip).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note body' })).toHaveTextContent('정리된 메모'), {
      timeout: 3000,
    });
  });

  it('applies a result that completed while another note was open', async () => {
    const user = userEvent.setup();
    await configure();
    const other = await seedNote('다른 노트', '다른 내용');
    const note = await openNoteWith('나중에 적용될 메모');
    select('나중에 적용될 메모');
    await user.click(within(await screen.findByRole('toolbar', { name: 'AI actions' })).getByRole('button', { name: /Organize/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note body' }).querySelector('.ai-processing')).not.toBeNull());

    // 처리 중에 다른 노트로 이동 → 완료 → 원래 노트로 복귀
    await user.click(within(screen.getByRole('region', { name: 'Note list' })).getByText('다른 노트'));
    await waitFor(() => expect(window.location.hash).toBe(`#/notes/${other.id}`));
    await waitFor(
      async () => expect((await getBlink().ai.listJobs({ noteId: note.id })).items[0]?.status).toBe('COMPLETED'),
      { timeout: 3000 },
    );
    await user.click(within(screen.getByRole('region', { name: 'Note list' })).getByText('메모'));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note body' })).toHaveTextContent('정리된 메모'), {
      timeout: 3000,
    });
  });
});
