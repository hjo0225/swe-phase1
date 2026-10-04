import { forwardRef, useId, type PointerEvent } from 'react';
import type { InfographicSpec } from '../../../../shared/visualization/infographic-spec';
import { infographicTheme as t } from '../theme/infographic-theme';
import { layoutInfographic } from './layout';

/**
 * Spec → SVG. 모든 유형(process, hierarchy, comparison, mindmap)이 같은 카드·연결선 디자인을 쓴다 (디자인 일관성, 명세서 §18).
 * PNG 변환을 위해 CSS 없이 속성만으로 그린다.
 */
interface InfographicSvgProps {
  spec: InfographicSpec;
  /** 있으면 카드를 끌 수 있다 (편집 가능한 노트에서만) */
  onCardPointerDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
}

export const InfographicSvg = forwardRef<SVGSVGElement, InfographicSvgProps>(function InfographicSvg(
  { spec, onCardPointerDown },
  ref,
) {
  const layout = layoutInfographic(spec);
  const uid = useId().replace(/:/g, '');
  const shadowId = `shadow-${uid}`;
  const emphasisId = `emphasis-${uid}`;
  const glowId = `glow-${uid}`;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      fontFamily={t.font}
      role="img"
      aria-label={spec.title}
    >
      <defs>
        <filter id={shadowId} x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={t.card.shadow} />
        </filter>
        <linearGradient id={emphasisId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.emphasis.from} />
          <stop offset="100%" stopColor={t.emphasis.to} />
        </linearGradient>
        <radialGradient id={glowId} cx="85%" cy="10%" r="60%">
          <stop offset="0%" stopColor={t.backgroundGlow} />
          <stop offset="100%" stopColor="rgba(66,129,231,0)" />
        </radialGradient>
      </defs>

      <rect width={layout.width} height={layout.height} rx={24} fill={t.background} />
      <rect width={layout.width} height={layout.height} rx={24} fill={`url(#${glowId})`} />
      <text x={t.spacing.margin} y={t.spacing.margin + 6} fontSize={t.title.size} fontWeight={t.title.weight} fill={t.title.color}>
        {layout.title}
      </text>

      {layout.panels.map((panel, i) => (
        <rect
          key={`panel-${i}`}
          data-panel=""
          x={panel.x}
          y={panel.y}
          width={panel.width}
          height={panel.height}
          rx={t.panel.radius}
          fill={t.panel.fill}
          fillOpacity={t.panel.fillOpacity}
          stroke={t.panel.stroke}
        />
      ))}

      {layout.edges.map((edge) => (
        <g key={`${edge.from}-${edge.to}`}>
          <path d={edge.path} fill="none" stroke={t.edge.color} strokeWidth={t.edge.width} />
          <circle cx={edge.end.x} cy={edge.end.y} r={t.edge.dotRadius} fill={t.edge.dot} />
        </g>
      ))}

      {layout.nodes.map((node) => {
        const titleColor = node.emphasis ? t.emphasis.text : t.nodeTitle.color;
        const descColor = node.emphasis ? t.emphasis.subText : t.nodeDescription.color;
        const textX = node.x + t.card.padding;
        const firstLineY = node.y + t.card.padding + t.nodeTitle.size;
        const descStartY =
          node.y + t.card.padding + node.titleLines.length * t.nodeTitle.lineHeight + t.spacing.descGap + t.nodeDescription.size;
        return (
          <g
            key={node.id}
            data-card={node.id}
            onPointerDown={onCardPointerDown ? (event) => onCardPointerDown(node.id, event) : undefined}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={t.card.radius}
              fill={node.emphasis ? `url(#${emphasisId})` : t.card.fill}
              fillOpacity={node.emphasis ? 1 : t.card.fillOpacity}
              stroke={node.emphasis ? 'none' : t.card.stroke}
              filter={`url(#${shadowId})`}
            />
            <text x={textX} y={firstLineY} fontSize={t.nodeTitle.size} fontWeight={t.nodeTitle.weight} fill={titleColor}>
              {node.titleLines.map((line, i) => (
                <tspan key={i} x={textX} dy={i === 0 ? 0 : t.nodeTitle.lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
            {node.descriptionLines.length > 0 && (
              <text x={textX} y={descStartY} fontSize={t.nodeDescription.size} fontWeight={t.nodeDescription.weight} fill={descColor}>
                {node.descriptionLines.map((line, i) => (
                  <tspan key={i} x={textX} dy={i === 0 ? 0 : t.nodeDescription.lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
