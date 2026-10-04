import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import {
  parseInfographicSpec,
  type CardPosition,
  type InfographicSpec,
} from '../../../../shared/visualization/infographic-spec';
import { getBlink } from '../../../shared/api/blink';
import { toast } from '../../../shared/ui/toast';
import { svgToPng } from '../export/svg-to-png';
import { InfographicSvg } from '../renderers/InfographicSvg';
import { layoutInfographic } from '../renderers/layout';
import { infographicTheme as t } from '../theme/infographic-theme';
import styles from './InfographicView.module.css';

/** 이만큼(화면 px) 움직여야 끌기로 본다 — 그냥 누른 것은 위치를 저장하지 않는다 */
const DRAG_THRESHOLD = 3;

interface Drag {
  id: string;
  pointerId: number;
  startClient: { x: number; y: number };
  startCard: CardPosition;
  /** 화면 px → SVG 좌표 (SVG가 노트 폭에 맞춰 줄어 보일 수 있다) */
  scale: number;
  current: CardPosition;
  moved: boolean;
}

/** 인포그래픽 블록: Spec 검증(SpecGuard) → SVG Preview(카드 끌기) → [위치 초기화] [PNG로 저장] [삭제]. */
export function InfographicView({ node, deleteNode, selected, editor, updateAttributes }: ReactNodeViewProps) {
  const spec = useMemo<InfographicSpec | null>(() => {
    try {
      return parseInfographicSpec(node.attrs.spec);
    } catch {
      return null; // 오래되었거나 손상된 Spec — 문서는 계속 열린다
    }
  }, [node.attrs.spec]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // 놓은 위치. 저장한 속성이 노드에 돌아올 때까지(비동기) 붙잡아 두어 카드가 원래 자리로 튀지 않게 한다
  const [dropped, setDropped] = useState<{ id: string; at: CardPosition } | null>(null);
  useEffect(() => setDropped(null), [node.attrs.spec]);
  const editable = editor.isEditable;

  // 끄는 동안에는 그 카드만 놓인 자리로 옮겨 그린다 — 선과 캔버스는 레이아웃이 다시 잡는다
  const override = drag ? { id: drag.id, at: drag.current } : dropped;
  const shown = useMemo<InfographicSpec | null>(
    () => (spec && override ? { ...spec, positions: { ...spec.positions, [override.id]: override.at } } : spec),
    [spec, override],
  );

  const savePosition = (id: string, position: CardPosition) => {
    const raw = node.attrs.spec as { positions?: Record<string, CardPosition> };
    updateAttributes({
      spec: {
        ...raw,
        positions: {
          ...raw.positions,
          [id]: { x: Math.max(t.spacing.margin, position.x), y: Math.max(t.spacing.header, position.y) },
        },
      },
    });
  };

  const resetLayout = () => {
    const { positions: _dropped, ...rest } = node.attrs.spec as Record<string, unknown>;
    updateAttributes({ spec: rest });
  };

  const onCardPointerDown = (id: string, event: PointerEvent<SVGGElement>) => {
    if (!spec || event.button !== 0) return;
    // 편집기가 블록을 선택하거나 블록째 끌기(드래그 앤 드롭)를 시작하지 않게 한다
    event.preventDefault();
    event.stopPropagation();
    const card = layoutInfographic(spec).nodes.find((n) => n.id === id);
    if (!card) return;
    const shownWidth = svgRef.current?.getBoundingClientRect().width ?? 0;
    const width = Number(svgRef.current?.getAttribute('width') ?? 0);
    setDrag({
      id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startCard: { x: card.x, y: card.y },
      scale: shownWidth > 0 && width > 0 ? width / shownWidth : 1,
      current: { x: card.x, y: card.y },
      moved: false,
    });
  };

  // 손을 뗄 때까지 창 전체에서 포인터를 따라간다 (카드 밖으로 빨리 움직여도 놓치지 않게)
  const dragging = drag !== null;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.startClient.x;
      const dy = event.clientY - current.startClient.y;
      const moved = current.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD;
      setDrag({
        ...current,
        moved,
        current: {
          x: Math.round(current.startCard.x + dx * current.scale),
          y: Math.round(current.startCard.y + dy * current.scale),
        },
      });
    };
    const onUp = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      setDrag(null);
      if (!current.moved) return;
      setDropped({ id: current.id, at: current.current });
      savePosition(current.id, current.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // savePosition은 매 렌더 새로 만들어지지만 끄는 동안 바뀌는 것은 drag뿐이다
  }, [dragging]);

  const savePng = async () => {
    if (!spec || !svgRef.current) return;
    setSaving(true);
    try {
      const png = await svgToPng(svgRef.current);
      const result = await getBlink().visualization.savePng({ png, suggestedFileName: spec.title });
      if (result.saved) toast.show('Saved as PNG');
    } catch (error) {
      toast.show(error instanceof BlinkIpcError ? "Couldn't save the file" : "Couldn't create the PNG");
    } finally {
      setSaving(false);
    }
  };

  return (
    <NodeViewWrapper
      as="figure"
      className={`glass ${styles.figure}`}
      data-selected={selected}
      aria-label={spec?.title ?? 'Infographic'}
      contentEditable={false}
    >
      {shown ? (
        <div className={styles.canvas} data-editable={editable || undefined} data-dragging={drag?.moved || undefined}>
          <InfographicSvg ref={svgRef} spec={shown} onCardPointerDown={editable ? onCardPointerDown : undefined} />
        </div>
      ) : (
        <p className={styles.invalid}>This infographic can't be displayed</p>
      )}
      <div className={styles.toolbar}>
        {spec?.positions && editable && (
          <button type="button" onClick={resetLayout}>
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
            Reset layout
          </button>
        )}
        {spec && (
          <button type="button" disabled={saving} onClick={() => void savePng()}>
            <Download size={14} strokeWidth={1.75} aria-hidden />
            Save as PNG
          </button>
        )}
        <button type="button" aria-label="Delete infographic" onClick={() => deleteNode()}>
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
