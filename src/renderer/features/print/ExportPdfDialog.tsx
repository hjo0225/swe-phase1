import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_PDF_OPTIONS,
  effectiveColumns,
  pageGeometry,
  type ColumnCount,
  type MarginPreset,
  type Orientation,
  type PageGeometry,
  type PageSize,
  type PdfExportOptions,
} from '../../../shared/print/pdf-options';
import { getBlink } from '../../shared/api/blink';
import { Modal } from '../../shared/ui/Modal';
import { SegmentedControl, type SegmentedOption } from '../../shared/ui/SegmentedControl';
import { Switch } from '../../shared/ui/Switch';
import { toast } from '../../shared/ui/toast';
import styles from './ExportPdfDialog.module.css';
import { PrintDocument } from './PrintDocument';
import { summarizePdf } from './pdf-summary';
import { startsWithTopLevelHeading } from './print-title';
import { usePrintFit, type PrintFit } from './use-print-fit';

const PAGE_SIZE_OPTIONS: SegmentedOption<PageSize>[] = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'Letter', label: 'Letter' },
];
const ORIENTATION_OPTIONS: SegmentedOption<Orientation>[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];
const COLUMN_OPTIONS: SegmentedOption<'1' | '2'>[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];
const MARGIN_OPTIONS: SegmentedOption<MarginPreset>[] = [
  { value: 'default', label: 'Default' },
  { value: 'small', label: 'Small' },
  { value: 'none', label: 'None' },
];

/** ResizeObserver가 없을 때(테스트) 쓰는 미리보기 칸 안쪽 크기 */
const FALLBACK_PANE = { width: 520, height: 600 };

type DialogOptions = Required<PdfExportOptions>;

interface ExportPdfDialogProps {
  /** 지금 편집기의 내용 — 저장을 마친 뒤 연다 */
  note: { id: string; title: string; content: string };
  onClose(): void;
}

/**
 * PDF 내보내기 창. 왼쪽은 PDF와 같은 문서(PrintDocument)를 같은 배율로 그린 종이 미리보기,
 * 오른쪽은 설정, 아래는 요약과 Cancel·Export. Export를 누르면 Main이 저장할 곳을 묻는다.
 * (Obsidian Better Export PDF처럼 내보내기 전에 모양을 보고 고친다)
 */
export function ExportPdfDialog({ note, onClose }: ExportPdfDialogProps) {
  const startsWithHeading = startsWithTopLevelHeading(note.content);
  const [options, setOptions] = useState<DialogOptions>({ ...DEFAULT_PDF_OPTIONS, includeTitle: !startsWithHeading });
  const [exporting, setExporting] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const set =
    <K extends keyof DialogOptions>(key: K) =>
    (value: DialogOptions[K]) =>
      setOptions((current) => ({ ...current, [key]: value }));

  const page = pageGeometry(options);
  const columns = effectiveColumns(options);
  const fit = usePrintFit(root, page, options.fitToOnePage, `${options.includeTitle}:${columns}`);
  const onPrintReady = useCallback((ready: HTMLElement) => setRoot(ready), []);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const result = await getBlink().notes.exportPdf({ id: note.id, options: { ...options, columns } });
      if (!result.saved) return; // 저장 창을 닫았다 — 설정을 고쳐 다시 내보낼 수 있게 둔다
      toast.show(result.clipped ? 'Saved as PDF, but the note was too long and the bottom was cut off' : 'Saved as PDF');
      onClose();
    } catch {
      toast.show("Couldn't export the PDF");
    } finally {
      setExporting(false);
    }
  };

  const titleHint = options.includeTitle
    ? `Adds “${note.title}” at the top`
    : startsWithHeading
      ? 'The note already starts with a heading'
      : 'Prints only the note body';

  return (
    <Modal title="Export PDF" wide onClose={onClose}>
      <div className={styles.layout}>
        <PagePreview page={page} fit={fit} fitToOnePage={options.fitToOnePage}>
          <PrintDocument
            note={note}
            includeTitle={options.includeTitle}
            printableWidthPx={page.printableWidthPx}
            columns={columns}
            onPrintReady={onPrintReady}
          />
        </PagePreview>

        <div className={styles.settings}>
          <Switch label="Include note title" hint={titleHint} checked={options.includeTitle} onChange={set('includeTitle')} />
          <Field label="Page size">
            <SegmentedControl label="Page size" options={PAGE_SIZE_OPTIONS} value={options.pageSize} onChange={set('pageSize')} />
          </Field>
          <Field label="Orientation">
            <SegmentedControl label="Orientation" options={ORIENTATION_OPTIONS} value={options.orientation} onChange={set('orientation')} />
          </Field>
          <Field label="Margin">
            <SegmentedControl label="Margin" options={MARGIN_OPTIONS} value={options.margin} onChange={set('margin')} />
          </Field>
          <Switch
            label="Fit to one page"
            hint={options.fitToOnePage ? 'Shrinks the note to fit one page' : 'Long notes continue on the next pages'}
            checked={options.fitToOnePage}
            onChange={set('fitToOnePage')}
          />
          <Field label="Columns" hint={options.fitToOnePage ? undefined : 'Turn on Fit to one page to use two columns'}>
            <SegmentedControl
              label="Columns"
              options={COLUMN_OPTIONS}
              value={String(columns) as '1' | '2'}
              disabled={!options.fitToOnePage}
              onChange={(value) => set('columns')(Number(value) as ColumnCount)}
            />
          </Field>
        </div>

        <footer className={styles.footer}>
          <p className={styles.summary} aria-live="polite">
            <span>{fit ? summarizePdf(options, fit) : 'Laying out…'}</span>
            {fit?.clipped && <span className={styles.warning}>Too long for one page — the bottom will be cut off</span>}
          </p>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={exporting}
            aria-busy={exporting || undefined}
            onClick={() => void exportPdf()}
          >
            Export
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      {/* 화면 읽기는 radiogroup의 이름으로 읽는다 */}
      <span className={styles.fieldLabel} aria-hidden>
        {label}
      </span>
      {children}
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

interface PagePreviewProps {
  page: PageGeometry;
  fit: PrintFit | null;
  fitToOnePage: boolean;
  children: ReactNode;
}

/**
 * 종이 모양 미리보기. 종이는 실제 크기(CSS px)로 그린 뒤 칸에 맞게 줄여 보여 준다.
 * 한 장 맞춤이면 종이 한 장이 칸에 다 보이고, 아니면 폭에 맞춰 길게 이어 그리며 장 경계를 점선으로 표시한다
 * (Chromium은 줄 중간에서 자르지 않으려고 조금 일찍 넘길 수 있어 경계는 근사다).
 * 장식용이라 화면 읽기에서는 숨긴다 — 요약 줄이 같은 정보를 준다.
 */
function PagePreview({ page, fit, fitToOnePage, children }: PagePreviewProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState(FALLBACK_PANE);

  useLayoutEffect(() => {
    const element = paneRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPane({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pages = fitToOnePage ? 1 : (fit?.pages ?? 1);
  const contentHeight = page.printableHeightPx * pages;
  const paperHeight = contentHeight + 2 * page.marginPx;
  const width = Math.max(pane.width, 1);
  const height = Math.max(pane.height, 1);
  const zoom = fitToOnePage ? Math.min(width / page.pageWidthPx, height / page.pageHeightPx) : width / page.pageWidthPx;

  return (
    <div ref={paneRef} className={styles.pane}>
      <div className={styles.paperFrame} style={{ width: page.pageWidthPx * zoom, height: paperHeight * zoom }} aria-hidden>
        <div
          className={styles.paper}
          style={{ width: page.pageWidthPx, height: paperHeight, padding: page.marginPx, transform: `scale(${zoom})` }}
        >
          <div className={styles.printable} style={{ width: page.printableWidthPx, height: contentHeight }} data-measuring={fit ? undefined : ''}>
            <div className={styles.content} style={{ transform: `scale(${fit?.scale ?? 1})` }}>
              {children}
            </div>
            {Array.from({ length: pages - 1 }, (_, i) => (
              <div key={i} className={styles.pageBreak} style={{ top: page.printableHeightPx * (i + 1) }}>
                <span>Page {i + 2}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
