import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLUMN_GAP_PX, type ColumnCount } from '../../../shared/print/pdf-options';
import { PRINT_ROOT_ATTRIBUTE } from '../../../shared/print/print-page';
import { NoteEditor } from '../editor/NoteEditor';
import styles from './PrintNotePage.module.css';
import { waitForPrintReady } from './print-readiness';

interface PrintDocumentProps {
  note: { id: string; title: string; content: string };
  includeTitle: boolean;
  /** 종이의 인쇄 영역 폭. 길면 측정하는 쪽(Main·미리보기)이 요소 폭을 직접 넓혀 다시 배치한다 */
  printableWidthPx: number;
  /** 2 = 논문처럼 두 단. 맨 위 제목(h1)은 두 단에 걸친다 */
  columns: ColumnCount;
  /** 그림·글꼴·비동기 배치까지 끝나 잴 수 있게 되면 한 번 부른다 */
  onPrintReady(root: HTMLElement): void;
}

/**
 * 종이에 찍을 노트 한 장: 제목(선택)과 읽기 전용 본문. 인쇄 화면(`#/print/<id>`)과 내보내기 미리보기가 같은 것을 그린다
 * — 그래서 미리보기의 줄바꿈·배율이 PDF와 같다.
 */
export function PrintDocument({ note, includeTitle, printableWidthPx, columns, onPrintReady }: PrintDocumentProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onReady = useCallback((ready: Editor) => setEditor(ready), []);
  const onPrintReadyRef = useRef(onPrintReady);
  onPrintReadyRef.current = onPrintReady;

  useEffect(() => {
    const root = rootRef.current;
    if (!editor || !root) return;
    let cancelled = false;
    void waitForPrintReady(root).then(() => {
      if (!cancelled) onPrintReadyRef.current(root);
    });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  // 그림·인포그래픽은 넓게 다시 배치해도 배율 1의 종이에서 차지할 폭(한 단의 폭)을 넘지 않는다 (PrintNotePage.module.css)
  const mediaWidth = columns === 2 ? (printableWidthPx - COLUMN_GAP_PX) / 2 : printableWidthPx;
  return (
    <main
      ref={rootRef}
      {...{ [PRINT_ROOT_ATTRIBUTE]: '' }}
      data-columns={columns}
      className={`${styles.sheet}${columns === 2 ? ` ${styles.twoColumns}` : ''}`}
      // 인쇄 영역과 같은 폭으로 그린다 — 배율 1에서 화면과 PDF의 줄바꿈이 같다
      style={{
        width: printableWidthPx,
        ['--print-media-width' as string]: `${mediaWidth}px`,
        ['--print-column-gap' as string]: `${COLUMN_GAP_PX}px`,
      }}
    >
      {includeTitle && <h1 className={styles.title}>{note.title}</h1>}
      <NoteEditor noteId={note.id} initialMarkdown={note.content} editable={false} onReady={onReady} onChange={() => undefined} />
    </main>
  );
}
