// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { resetBlinkForTests } from '../../shared/api/blink';
import { seedNote } from '../../test/seed-note';
import { pageGeometry } from '../../../shared/print/pdf-options';
import { resetAutosaveForTests } from '../notes/autosave/autosave';

const SPEC = {
  version: 1,
  type: 'process',
  title: '처리 과정',
  nodes: [
    { id: 'n1', title: '입력', description: '노트를 쓴다' },
    { id: 'n2', title: '분석', description: 'AI가 분석한다' },
    { id: 'n3', title: '결과', description: '결과를 만든다' },
  ],
  edges: [
    ['n1', 'n2'],
    ['n2', 'n3'],
  ],
};

const POSTER = [
  '# 연구 개요',
  '',
  '이 포스터는 **Blink**로 만들었다.',
  '',
  '- 첫째 항목',
  '- 둘째 항목',
  '',
  '![구조도](images/screen-1.png)',
  '',
  '```blink-infographic',
  JSON.stringify(SPEC, null, 2),
  '```',
].join('\n');

describe('print route', () => {
  const decode = HTMLImageElement.prototype.decode;
  beforeEach(() => {
    resetBlinkForTests();
    resetAutosaveForTests();
    // jsdom은 그림을 불러오지 않는다
    HTMLImageElement.prototype.decode = () => Promise.resolve();
  });
  afterEach(() => {
    HTMLImageElement.prototype.decode = decode;
    window.location.hash = '';
  });

  it('prints the note title above a body that does not start with a top-level heading', async () => {
    const note = await seedNote('수업 포스터', `이 노트는 제목 없이 시작한다.\n\n${POSTER}`);
    window.location.hash = `#/print/${note.id}`;
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: '수업 포스터' })).toBeInTheDocument();
    expect(await screen.findByText('이 노트는 제목 없이 시작한다.')).toBeInTheDocument();
  });

  it('does not print the title twice when the body already starts with a top-level heading', async () => {
    const note = await seedNote('수업 포스터', `\n${POSTER}`);
    window.location.hash = `#/print/${note.id}`;
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: '연구 개요' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '수업 포스터' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('follows the title setting in the address over the automatic choice', async () => {
    const note = await seedNote('수업 포스터', POSTER);
    window.location.hash = `#/print/${note.id}?title=1`;
    const { unmount } = render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: '수업 포스터' })).toBeInTheDocument();
    unmount();

    const plain = await seedNote('메모', '제목 없이 시작한다.');
    window.location.hash = `#/print/${plain.id}?title=0`;
    render(<App />);
    expect(await screen.findByText('제목 없이 시작한다.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '메모' })).not.toBeInTheDocument();
  });

  it('lays the sheet out at the printable width of the chosen paper', async () => {
    const note = await seedNote('수업 포스터', POSTER);
    window.location.hash = `#/print/${note.id}?size=Letter&orientation=landscape&margin=none&fit=1`;
    render(<App />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-print-ready', 'true'));
    const width = pageGeometry({ pageSize: 'Letter', orientation: 'landscape', margin: 'none' }).printableWidthPx;
    expect((document.querySelector('[data-print-root]') as HTMLElement).style.width).toBe(`${width}px`);
  });

  it('renders only the note as a read-only document — body, image and infographic — and signals when it is ready', async () => {
    const note = await seedNote('수업 포스터', POSTER);
    window.location.hash = `#/print/${note.id}`;
    render(<App />);

    const body = await screen.findByRole('textbox', { name: 'Note body' });
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(await screen.findByRole('heading', { name: '연구 개요' })).toBeInTheDocument();
    expect(screen.getByText('둘째 항목')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: '구조도' });
    expect(img.getAttribute('src')).toMatch(/^blink-vault:\/\/image\//);
    expect(img).toHaveAttribute('loading', 'eager'); // 화면 밖 그림도 인쇄 전에 불러온다
    expect(screen.getByRole('figure', { name: '처리 과정' })).toBeInTheDocument();

    // 앱 화면(사이드바·머리줄·서식 도구막대·노트 버튼)은 없다
    expect(screen.queryByRole('navigation', { name: 'Blink' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Note location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Note title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-print-ready', 'true'));
    expect(document.querySelector('[data-print-root]')).toContainElement(body);
  });

  it('signals an error for a missing note instead of hanging', async () => {
    window.location.hash = '#/print/11111111-1111-4111-8111-111111111111';
    render(<App />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-print-ready', 'error'));
  });

  it('waits for an architecture diagram to be laid out before signalling ready', async () => {
    const architecture = {
      version: 1,
      type: 'architecture',
      title: 'Web service',
      groups: [{ id: 'vpc', title: 'VPC A' }],
      nodes: [
        { id: 'u', title: 'Users', icon: 'user' },
        { id: 'w', title: 'Web server', icon: 'server', group: 'vpc' },
      ],
      edges: [['u', 'w', { label: 'HTTPS' }]],
    };
    const note = await seedNote('구조', ['```blink-infographic', JSON.stringify(architecture), '```'].join('\n'));
    window.location.hash = `#/print/${note.id}`;
    render(<App />);

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-print-ready', 'true'), { timeout: 5000 });
    // 신호를 준 순간 그림은 이미 다 그려져 있다 ("Laying out…"이 아니다)
    const figure = screen.getByRole('figure', { name: 'Web service' });
    expect(figure.querySelectorAll('[data-card]')).toHaveLength(2);
    expect(figure).not.toHaveAttribute('data-print-busy');
  });
});
