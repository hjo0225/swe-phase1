import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import type { NoteDetail } from '../../../shared/ipc/notes';
import { A4_PRINT } from '../../../shared/print/page-fit';
import { PRINT_READY_ATTRIBUTE, PRINT_ROOT_ATTRIBUTE, type PrintReadyState } from '../../../shared/print/print-page';
import { NoteEditor } from '../editor/NoteEditor';
import { useNoteDetail } from '../notes/api/note-queries';
import styles from './PrintNotePage.module.css';
import { waitForPrintReady } from './print-readiness';

const html = () => document.documentElement;
const signal = (state: PrintReadyState) => html().setAttribute(PRINT_READY_ATTRIBUTE, state);

/**
 * 인쇄 화면 `#/print/<noteId>`. Main이 숨은 창으로 열어 PDF로 만든다.
 * 앱 화면(사이드바·머리줄·도구막대) 없이 제목과 본문만 읽기 전용으로 그리고, 준비되면 data-print-ready를 단다.
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
  const rootRef = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onReady = useCallback((ready: Editor) => setEditor(ready), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!editor || !root) return;
    let cancelled = false;
    void waitForPrintReady(root).then(() => {
      if (!cancelled) signal('true');
    });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  return (
    <main
      ref={rootRef}
      {...{ [PRINT_ROOT_ATTRIBUTE]: '' }}
      className={styles.sheet}
      // 인쇄 영역과 같은 폭으로 그린다 — 배율 1에서 화면과 PDF의 줄바꿈이 같다
      style={{ width: A4_PRINT.printableWidthPx }}
    >
      <h1 className={styles.title}>{note.title}</h1>
      <NoteEditor noteId={note.id} initialMarkdown={note.content} editable={false} onReady={onReady} onChange={() => undefined} />
    </main>
  );
}
