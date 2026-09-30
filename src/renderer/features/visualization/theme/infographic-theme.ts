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
  nodeTitle: { size: 15, weight: 700, color: '#10213D', lineHeight: 20, maxChars: 12 },
  nodeDescription: { size: 13, weight: 400, color: '#40536E', lineHeight: 18, maxChars: 14 },
  edge: { color: 'rgba(66,129,231,0.45)', width: 1.5, dot: '#50DDCB', dotRadius: 3 },
  spacing: { margin: 32, header: 56, columnGap: 48, rowGap: 56, siblingGap: 24, levelGap: 56, descGap: 6 },
} as const;
