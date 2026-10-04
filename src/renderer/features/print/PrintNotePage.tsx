import { useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { NoteDetail } from '../../../shared/ipc/notes';
import { pageGeometry, parsePrintQuery } from '../../../shared/print/pdf-options';
import { PRINT_READY_ATTRIBUTE, type PrintReadyState } from '../../../shared/print/print-page';
import { useNoteDetail } from '../notes/api/note-queries';
import { PrintDocument } from './PrintDocument';
import { startsWithTopLevelHeading } from './print-title';

const html = () => document.documentElement;
const signal = (state: PrintReadyState) => html().setAttribute(PRINT_READY_ATTRIBUTE, state);

/**
 * 인쇄 화면 `#/print/<noteId>?설정`. Main이 숨은 창으로 열어 PDF로 만든다.
 * 앱 화면(사이드바·머리줄·도구막대) 없이 제목과 본문만 읽기 전용으로 그리고, 준비되면 data-print-ready를 단다.
 * 종이 크기·여백은 인쇄 폭을, title은 제목 줄을 정한다(없으면 본문이 `# 제목`으로 시작하지 않을 때만).
 */
export function PrintNotePage() {
  const { noteId = '' } = useParams();
  const detail = useNoteDetail(noteId);

  // 앱 배경 대신 흰 종이
  useEffect(() => {
    html().setAttribute('data-print-page', '');
    return () => {
      html().removeAttribute('data-print-page');
      html().removeAttribute(PRINT_READY_ATTRIBUTE);
    };
  }, []);

  useEffect(() => {
    if (detail.isError) signal('error');
  }, [detail.isError]);

  if (detail.isPending) return null;
  if (detail.isError) return <p role="alert">Couldn't load the note</p>;
  return <PrintSheet note={detail.data} />;
}

function PrintSheet({ note }: { note: NoteDetail }) {
  const [search] = useSearchParams();
  const options = parsePrintQuery(search);
  const includeTitle = options.includeTitle ?? !startsWithTopLevelHeading(note.content);
  const onPrintReady = useCallback(() => signal('true'), []);
  return (
    <PrintDocument
      note={note}
      includeTitle={includeTitle}
      printableWidthPx={pageGeometry(options).printableWidthPx}
      columns={options.columns}
      onPrintReady={onPrintReady}
    />
  );
}
