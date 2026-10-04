/**
 * 인포그래픽 전용 상수 — docs/frontend/design-system.md "인포그래픽".
 * PNG로 내보내므로 CSS 변수 대신 SVG 속성에 값을 직접 쓴다.
 */
export const infographicTheme = {
  font: "'Pretendard Variable', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif",
  background: '#F3F8FF',
  backgroundGlow: 'rgba(66,129,231,0.12)',
  title: { size: 20, weight: 700, color: '#10213D' },
  card: {
    width: 208,
    padding: 16,
    radius: 16,
    fill: '#FFFFFF',
    fillOpacity: 0.92,
    stroke: 'rgba(123,177,241,0.35)',
    shadow: 'rgba(31,87,174,0.10)',
  },
  emphasis: { from: '#4281E7', to: '#2F6DDB', text: '#FFFFFF', subText: 'rgba(255,255,255,0.85)' },
  /** maxWidth: 한 줄 폭, 한글 글자 수 기준 (영문은 layout.wrapText가 좁게 잰다) */
  nodeTitle: { size: 15, weight: 700, color: '#10213D', lineHeight: 20, maxWidth: 12 },
  nodeDescription: { size: 13, weight: 400, color: '#40536E', lineHeight: 18, maxWidth: 14 },
  edge: { color: 'rgba(66,129,231,0.45)', width: 1.5, dot: '#50DDCB', dotRadius: 3 },
  spacing: {
    margin: 32,
    header: 56,
    columnGap: 48,
    rowGap: 56,
    siblingGap: 24,
    levelGap: 56,
    descGap: 6,
    /** 한 열(comparison)·한 묶음(mindmap 세부) 안의 카드 간격 */
    stackGap: 16,
    /** mindmap 주제 묶음 사이 */
    groupGap: 28,
    panelPadding: 16,
  },
  /** comparison 열 배경 */
  panel: { fill: '#FFFFFF', fillOpacity: 0.45, stroke: 'rgba(123,177,241,0.28)', radius: 24 },
  /** architecture: 아이콘 카드·그룹 상자·화살표·선 라벨 */
  architecture: {
    card: { width: 128, padding: 12, iconSize: 28, iconGap: 8 },
    title: { size: 13, weight: 600, lineHeight: 17, maxWidth: 9 },
    /** 층 구조 카드의 역할 (이름 아래 작은 글씨, 두 줄까지) */
    role: { size: 10.5, lineHeight: 13, maxWidth: 11, maxLines: 2, gap: 3, color: '#62758D' },
    group: {
      header: 34,
      padding: 20,
      label: { size: 12, weight: 700, color: '#2059C1' },
      outer: { stroke: '#6BA8F6', dash: '6 4', fill: 'none' },
      inner: { stroke: 'rgba(107,168,246,0.55)', fill: '#FFFFFF', fillOpacity: 0.45 },
    },
    edge: { color: '#62758D', width: 1.4, arrowSize: 7 },
    label: { size: 11, color: '#40536E', background: '#F3F8FF', paddingX: 4, height: 16 },
    spacing: { nodeNode: 36, betweenLayers: 72 },
    /** 층 쌓기 배치: 층 안 카드 간격, 한 줄 카드 수, 선과 라벨 사이, 같은 두 층 사이 선 간격, 층을 건너뛰는 선이 상자 옆으로 비켜 가는 거리 */
    stack: { cardGap: 24, perRow: 4, labelGap: 10, lineGap: 24, detour: 36 },
    icon: { color: '#2F6DDB', stroke: 1.75 },
  },
} as const;
