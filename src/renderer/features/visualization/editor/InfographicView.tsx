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
      if (result.saved) toast.show('PNG로 저장했습니다');
    } catch (error) {
      toast.show(error instanceof BlinkIpcError ? '파일을 저장하지 못했습니다' : 'PNG를 만들지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <NodeViewWrapper
      as="figure"
      className={`glass ${styles.figure}`}
      data-selected={selected}
      aria-label={spec?.title ?? '인포그래픽'}
      contentEditable={false}
    >
      {spec ? (
        <div className={styles.canvas}>
          <InfographicSvg ref={svgRef} spec={spec} />
        </div>
      ) : (
        <p className={styles.invalid}>표시할 수 없는 인포그래픽입니다</p>
      )}
      <div className={styles.toolbar}>
        {spec && (
          <button type="button" disabled={saving} onClick={() => void savePng()}>
            <Download size={14} strokeWidth={1.75} aria-hidden />
            PNG로 저장
          </button>
        )}
        <button type="button" aria-label="인포그래픽 삭제" onClick={() => deleteNode()}>
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
