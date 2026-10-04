import { forwardRef, useId, type PointerEvent } from 'react';
import { infographicTheme as t } from '../theme/infographic-theme';
import { ARCHITECTURE_ICON } from './architecture-icons';
import type { InfographicLayout } from './layout';

const a = t.architecture;

/**
 * 레이아웃(좌표) → SVG. 모든 유형이 같은 카드·연결선 디자인을 쓴다 (디자인 일관성, 명세서 §18).
 * architecture는 그룹 상자·아이콘 카드·화살표·선 라벨을 더한다.
 * PNG 변환을 위해 CSS 없이 속성만으로 그린다.
 */
interface InfographicSvgProps {
  layout: InfographicLayout;
  /** 있으면 카드를 끌 수 있다 (편집 가능한 노트에서만) */
  onCardPointerDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
}

export const InfographicSvg = forwardRef<SVGSVGElement, InfographicSvgProps>(function InfographicSvg(
  { layout, onCardPointerDown },
  ref,
) {
  const uid = useId().replace(/:/g, '');
  const shadowId = `shadow-${uid}`;
  const emphasisId = `emphasis-${uid}`;
  const glowId = `glow-${uid}`;
  const arrowId = `arrow-${uid}`;
  const hasArrows = layout.edges.some((edge) => edge.arrow);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      fontFamily={t.font}
      role="img"
      aria-label={layout.title}
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
        {hasArrows && (
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={a.edge.arrowSize}
            markerHeight={a.edge.arrowSize}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={a.edge.color} />
          </marker>
        )}
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

      {(layout.groups ?? []).map((g) => (
        <g key={g.id} data-group={g.id}>
          {/* 맨 바깥 그룹은 점선, 안쪽 그룹은 반투명 면 */}
          <rect
            x={g.x}
            y={g.y}
            width={g.width}
            height={g.height}
            rx={12}
            fill={g.depth === 0 ? a.group.outer.fill : a.group.inner.fill}
            fillOpacity={g.depth === 0 ? undefined : a.group.inner.fillOpacity}
            stroke={g.depth === 0 ? a.group.outer.stroke : a.group.inner.stroke}
            strokeDasharray={g.depth === 0 ? a.group.outer.dash : undefined}
          />
          <text x={g.x + 14} y={g.y + 22} fontSize={a.group.label.size} fontWeight={a.group.label.weight} fill={a.group.label.color}>
            {g.title}
          </text>
        </g>
      ))}

      {layout.edges.map((edge, i) => (
        <g key={`${edge.from}-${edge.to}-${i}`}>
          <path
            data-edge=""
            d={edge.path}
            fill="none"
            stroke={edge.arrow ? a.edge.color : t.edge.color}
            strokeWidth={edge.arrow ? a.edge.width : t.edge.width}
            markerEnd={edge.arrow ? `url(#${arrowId})` : undefined}
            markerStart={edge.arrow === 'both' ? `url(#${arrowId})` : undefined}
          />
          {/* 화살표가 없는 유형(4유형)은 끝점에 점 */}
          {!edge.arrow && <circle cx={edge.end.x} cy={edge.end.y} r={t.edge.dotRadius} fill={t.edge.dot} />}
          {edge.label && (
            <>
              <rect
                x={edge.label.x}
                y={edge.label.y}
                width={edge.label.width}
                height={edge.label.height}
                rx={4}
                fill={a.label.background}
              />
              <text
                x={edge.label.x + edge.label.width / 2}
                y={edge.label.y + edge.label.height / 2 + a.label.size / 2 - 1}
                fontSize={a.label.size}
                textAnchor="middle"
                fill={a.label.color}
              >
                {edge.label.text}
              </text>
            </>
          )}
        </g>
      ))}

      {layout.nodes.map((node) => {
        const onPointerDown = onCardPointerDown ? (event: PointerEvent<SVGGElement>) => onCardPointerDown(node.id, event) : undefined;
        if (node.icon) {
          // architecture: 아이콘 위, 이름은 가운데 정렬로 아래
          const Icon = ARCHITECTURE_ICON[node.icon];
          const cx = node.x + node.width / 2;
          const iconTop = node.y + a.card.padding;
          const textTop = iconTop + a.card.iconSize + a.card.iconGap + a.title.size;
          return (
            <g key={node.id} data-card={node.id} onPointerDown={onPointerDown}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={t.card.radius}
                fill={t.card.fill}
                fillOpacity={t.card.fillOpacity}
                stroke={t.card.stroke}
                filter={`url(#${shadowId})`}
              />
              {node.logo ? (
                // 알려진 기술은 그 로고 (simple-icons — viewBox 24)
                <svg
                  x={cx - a.card.iconSize / 2}
                  y={iconTop}
                  width={a.card.iconSize}
                  height={a.card.iconSize}
                  viewBox="0 0 24 24"
                  data-logo={node.logo.name}
                  aria-hidden
                >
                  <path d={node.logo.path} fill={node.logo.color} />
                </svg>
              ) : (
                <Icon
                  ref={withoutClass}
                  x={cx - a.card.iconSize / 2}
                  y={iconTop}
                  width={a.card.iconSize}
                  height={a.card.iconSize}
                  color={a.icon.color}
                  strokeWidth={a.icon.stroke}
                  aria-hidden
                />
              )}
              {node.descriptionLines.length > 0 && (
                // 역할: 이름 아래 작고 옅게 (층 구조 카드)
                <text
                  x={cx}
                  y={textTop + (node.titleLines.length - 1) * a.title.lineHeight + a.role.gap + a.role.lineHeight}
                  fontSize={a.role.size}
                  fill={a.role.color}
                  textAnchor="middle"
                >
                  {node.descriptionLines.map((line, i) => (
                    <tspan key={i} x={cx} dy={i === 0 ? 0 : a.role.lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              <text x={cx} y={textTop} fontSize={a.title.size} fontWeight={a.title.weight} fill={t.nodeTitle.color} textAnchor="middle">
                {node.titleLines.map((line, i) => (
                  <tspan key={i} x={cx} dy={i === 0 ? 0 : a.title.lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        }
        const titleColor = node.emphasis ? t.emphasis.text : t.nodeTitle.color;
        const descColor = node.emphasis ? t.emphasis.subText : t.nodeDescription.color;
        const textX = node.x + t.card.padding;
        const firstLineY = node.y + t.card.padding + t.nodeTitle.size;
        const descStartY =
          node.y + t.card.padding + node.titleLines.length * t.nodeTitle.lineHeight + t.spacing.descGap + t.nodeDescription.size;
        return (
          <g key={node.id} data-card={node.id} onPointerDown={onPointerDown}>
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

/**
 * lucide 아이콘은 늘 class="lucide lucide-…"를 붙인다(끌 수 없다). 인포그래픽은 CSS 클래스 없이 속성만으로 그리므로
 * (PNG 변환·화면이 같은 모습) 붙은 클래스를 지운다. className은 바뀌지 않아 React가 다시 붙이지 않는다.
 */
function withoutClass(svg: SVGSVGElement | null) {
  svg?.removeAttribute('class');
}
