// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { getBlink, resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { resetToastsForTests } from '../../shared/ui/toast';
import { resetAutosaveForTests } from '../notes/autosave/autosave';
import { infographicTheme as t } from './theme/infographic-theme';

const editorOf = () => (screen.getByRole('textbox', { name: 'Note body' }) as HTMLElement & { editor: Editor }).editor;

async function runAction(text: string, target: string, action: RegExp) {
  const user = userEvent.setup();
  await getBlink().settings.updateProvider({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'sk' });
  const note = await seedNote('메모', text);
  window.location.hash = `#/notes/${note.id}`;
  render(<App />);
  await screen.findByRole('textbox', { name: 'Note body' });
  const editor = editorOf();
  const from = 1 + editor.state.doc.textContent.indexOf(target);
  act(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from, to: from + target.length });
  });
  const bubble = await screen.findByRole('toolbar', { name: 'AI actions' });
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

  it('moves a card where it is dragged, saves the spot in the note and can reset the layout', async () => {
    const { user, note } = await runAction('노트를 쓰면 AI가 분석해서 결과를 만든다', '노트를 쓰면 AI가 분석해서 결과를 만든다', /Visualize/);
    const figure = await screen.findByRole('figure', { name: '처리 과정' }, { timeout: 3000 });
    const cardOf = () => within(figure).getByText('결과').closest('[data-card]') as SVGGElement;
    const rectOf = () => cardOf().querySelector('rect')!;
    const startX = Number(rectOf().getAttribute('x'));
    const startY = Number(rectOf().getAttribute('y'));
    expect(within(figure).queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();

    fireEvent.pointerDown(cardOf(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 160, clientY: 220 });
    // 끄는 동안 카드가 따라온다
    expect(Number(rectOf().getAttribute('x'))).toBe(startX + 60);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 160, clientY: 220 });

    expect(Number(rectOf().getAttribute('y'))).toBe(startY + 120);
    await waitFor(
      async () => {
        const content = (await getBlink().notes.get({ id: note.id })).content;
        expect(content).toContain('"positions"');
        expect(content).toContain(`"x": ${startX + 60}`);
      },
      { timeout: 3000 },
    );

    await user.click(within(figure).getByRole('button', { name: 'Reset layout' }));
    expect(Number(rectOf().getAttribute('x'))).toBe(startX);
    await waitFor(async () => expect((await getBlink().notes.get({ id: note.id })).content).not.toContain('"positions"'), {
      timeout: 3000,
    });
  }, 15_000); // 저장 확인을 두 번 기다린다 — 전체 실행 부하에서 기본 5초를 넘길 수 있다

  it('draws an architecture diagram after laying it out', async () => {
    await runAction('architecture: users call a web server in a VPC', 'architecture: users call a web server in a VPC', /Visualize/);
    const figure = await screen.findByRole('figure', { name: 'Web service' }, { timeout: 3000 });
    expect(await within(figure).findByText('VPC A', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(figure).getByText('HTTPS')).toBeInTheDocument();
    expect(figure.querySelectorAll('[data-card]')).toHaveLength(2);
  });

  it('drags an architecture card and keeps its line attached', async () => {
    await runAction('architecture: users call a web server in a VPC', 'architecture: users call a web server in a VPC', /Visualize/);
    const figure = await screen.findByRole('figure', { name: 'Web service' }, { timeout: 3000 });
    await within(figure).findByText('VPC A', {}, { timeout: 3000 });
    const cardOf = () => within(figure).getByText('Web server').closest('[data-card]') as SVGGElement;
    const rectOf = () => cardOf().querySelector('rect')!;
    const startX = Number(rectOf().getAttribute('x'));
    const startY = Number(rectOf().getAttribute('y'));

    fireEvent.pointerDown(cardOf(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 140, clientY: 180 });
    // 끄는 자리는 정수로 맞춘다 (ELK 좌표는 소수일 수 있다)
    const [endX, endY] = [Math.round(startX + 40), Math.round(startY + 80)];
    expect(Number(rectOf().getAttribute('x'))).toBe(endX);
    expect(Number(rectOf().getAttribute('y'))).toBe(endY);
    // 선은 옮긴 카드의 왼쪽 면에서 끝난다
    const line = figure.querySelector('path[data-edge]')!.getAttribute('d')!;
    expect(line).toMatch(new RegExp(`L ${endX} [\\d.]+$`));
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 140, clientY: 180 });
    expect(Number(rectOf().getAttribute('x'))).toBe(endX);
    expect(within(figure).getByText('VPC A')).toBeInTheDocument();
  });

  it('leaves the layout untouched when a card is dragged away and dropped back where it was', async () => {
    const { note } = await runAction(
      'architecture: users call a web server in a VPC',
      'architecture: users call a web server in a VPC',
      /Visualize/,
    );
    const figure = await screen.findByRole('figure', { name: 'Web service' }, { timeout: 3000 });
    await within(figure).findByText('VPC A', {}, { timeout: 3000 });
    const cardOf = () => within(figure).getByText('Web server').closest('[data-card]') as SVGGElement;
    await waitFor(async () => expect((await getBlink().notes.get({ id: note.id })).content).toContain('blink-infographic'), { timeout: 3000 });

    fireEvent.pointerDown(cardOf(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 160, clientY: 150 }); // 연결선이 따라오는 걸 보여 주고
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 100 }); // 제자리로
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });

    await new Promise((resolve) => setTimeout(resolve, 1500)); // 자동 저장이 돌았을 시간
    expect((await getBlink().notes.get({ id: note.id })).content).not.toContain('"positions"');
    expect(within(figure).queryByRole('button', { name: /Reset layout/ })).not.toBeInTheDocument();
  }, 15_000);

  it('saves a card dropped against the title area exactly where it is drawn', async () => {
    const { note } = await runAction(
      'architecture: users call a web server in a VPC',
      'architecture: users call a web server in a VPC',
      /Visualize/,
    );
    const figure = await screen.findByRole('figure', { name: 'Web service' }, { timeout: 3000 });
    await within(figure).findByText('VPC A', {}, { timeout: 3000 });
    const cardOf = () => within(figure).getByText('Web server').closest('[data-card]') as SVGGElement;
    const rectOf = () => cardOf().querySelector('rect')!;

    // 그룹 안 카드는 제목 영역뿐 아니라 그룹 이름 자리까지 비켜 그려진다 — 저장 값도 그 자리여야 한다
    fireEvent.pointerDown(cardOf(), { pointerId: 1, button: 0, clientX: 100, clientY: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 110, clientY: 0 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 110, clientY: 0 });
    const drawnX = Number(rectOf().getAttribute('x'));
    const drawnY = Number(rectOf().getAttribute('y'));
    expect(drawnY).toBeGreaterThan(t.spacing.header); // 그룹 깊이만큼 더 내려와 있다

    await waitFor(
      async () => {
        const content = (await getBlink().notes.get({ id: note.id })).content;
        expect(content).toMatch(new RegExp(`"w": \\{\\s*"x": ${drawnX},\\s*"y": ${drawnY}\\s*\\}`));
      },
      { timeout: 3000 },
    );
    // 저장한 값이 돌아와도 카드는 그 자리에 있다
    expect(Number(rectOf().getAttribute('y'))).toBe(drawnY);
  }, 15_000);

  it('keeps the original text and inserts the infographic below it', async () => {
    const { user, note } = await runAction('노트를 쓰면 AI가 분석해서 결과를 만든다', '노트를 쓰면 AI가 분석해서 결과를 만든다', /Visualize/);

    const figure = await screen.findByRole('figure', { name: '처리 과정' }, { timeout: 3000 });
    const body = screen.getByRole('textbox', { name: 'Note body' });
    expect(body).toHaveTextContent('노트를 쓰면 AI가 분석해서 결과를 만든다');
    expect(body.querySelector('.ai-processing')).toBeNull();
    expect(within(figure).getByText('입력')).toBeInTheDocument();
    expect(within(figure).getByText('결과')).toBeInTheDocument();

    // PNG 저장 버튼은 Main으로 PNG를 보낸다 (Mock은 경로를 돌려준다)
    expect(within(figure).getByRole('button', { name: 'Save as PNG' })).toBeInTheDocument();

    // 인포그래픽은 .md 본문에 blink-infographic 코드 블록(Spec JSON)으로 저장된다 (D-18)
    await waitFor(
      async () =>
        expect((await getBlink().notes.get({ id: note.id })).content).toMatch(/```blink-infographic\n\{[\s\S]*"type": "process"/),
      { timeout: 3000 },
    );

    await user.click(within(figure).getByRole('button', { name: 'Delete infographic' }));
    expect(screen.queryByRole('figure', { name: '처리 과정' })).not.toBeInTheDocument();
  });

  it('replaces the selection with researched text followed by its sources', async () => {
    await runAction('Electron은 데스크톱 앱 프레임워크다', 'Electron은 데스크톱 앱 프레임워크다', /Expand/);
    const body = screen.getByRole('textbox', { name: 'Note body' });
    await waitFor(() => expect(body).toHaveTextContent('(구체화됨)'), { timeout: 3000 });
    expect(within(body).getByText('Sources')).toBeInTheDocument();
    expect(within(body).getByRole('link', { name: '예시 출처' })).toHaveAttribute('href', 'https://example.com/');
  });

  it('shows a placeholder instead of crashing on an invalid stored spec', async () => {
    const note = await seedNote('깨진 인포그래픽', '```blink-infographic\n{"type":"nope"}\n```');
    window.location.hash = `#/notes/${note.id}`;
    render(<App />);
    expect(await screen.findByText('This infographic can\'t be displayed')).toBeInTheDocument();
  });
});
