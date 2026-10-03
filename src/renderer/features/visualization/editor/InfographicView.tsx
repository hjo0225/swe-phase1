import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Download, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { parseInfographicSpec, type InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { getBlink } from '../../../shared/api/blink';
import { toast } from '../../../shared/ui/toast';
import { svgToPng } from '../export/svg-to-png';
import { InfographicSvg } from '../renderers/InfographicSvg';
import styles from './InfographicView.module.css';

/** 인포그래픽 블록: Spec 검증(SpecGuard) → SVG Preview → [PNG로 저장] [삭제]. */
export function InfographicView({ node, deleteNode, selected }: ReactNodeViewProps) {
  const spec = useMemo<InfographicSpec | null>(() => {
    try {
      return parseInfographicSpec(node.attrs.spec);
    } catch {
      return null; // 오래되었거나 손상된 Spec — 문서는 계속 열린다
    }
  }, [node.attrs.spec]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState(false);

  const savePng = async () => {
    if (!spec || !svgRef.current) return;
    setSaving(true);
    try {
      const png = await svgToPng(svgRef.current);
      const result = await getBlink().visualization.savePng({ png, suggestedFileName: spec.title });
      if (result.saved) toast.show('Saved as PNG');
    } catch (error) {
      toast.show(error instanceof BlinkIpcError ? 'Couldn\'t save the file' : 'Couldn\'t create the PNG');
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
      {spec ? (
        <div className={styles.canvas}>
          <InfographicSvg ref={svgRef} spec={spec} />
        </div>
      ) : (
        <p className={styles.invalid}>This infographic can't be displayed</p>
      )}
      <div className={styles.toolbar}>
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
