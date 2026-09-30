# Frontend — Design System: Cloud Glass

> **Soft intelligence floating in an open blue space.**

Blue를 신뢰와 지능의 기본색으로 쓰고, Mint는 **AI의 활성 상태와 연결**에만 쓴다. 깊이는 검은 그림자가 아니라 Blur, 투명도, 빛 번짐으로 표현한다. 색은 Blue + White + Mint로 극단적으로 제한한다.

이 문서는 사용자가 정의한 Cloud Glass 시스템을 **Blink(글쓰기 도구)에 맞게 적용한 규칙**이다. 원본 시스템은 랜딩 페이지·대시보드까지 포괄하므로, Blink에 해당하지 않는 부분(Hero, Display 타입, 섹션 간격 96~160px, 12컬럼 그리드, 대시보드 카드)은 제외하고, 글쓰기 가독성을 위해 조정한 부분은 [조정 사항](#blink-적용-시-조정-사항)에 이유와 함께 적었다.

## Tokens

코드 SSOT: `src/renderer/shared/ui/tokens.css`. 아래는 기준값이다.

```css
:root {
  /* Brand */
  --blue-50:#F3F8FF; --blue-100:#E5F1FF; --blue-200:#C9E2FF; --blue-300:#9BC8FA; --blue-400:#6BA8F6;
  --blue-500:#4281E7; --blue-600:#2F6DDB; --blue-700:#2059C1; --blue-800:#174591; --blue-900:#103268;
  /* Accent — AI 활성·연결 전용 */
  --mint-50:#EDFFFC; --mint-200:#A9F1E7; --mint-400:#50DDCB; --mint-500:#28C8B8; --mint-600:#18A99D;
  /* Ink — blue-tinted neutral, 모든 본문 텍스트 */
  --ink-900:#10213D; --ink-800:#203451; --ink-700:#40536E; --ink-600:#62758D; --ink-500:#8394A9;
  --ink-300:#B9C7D8; --ink-200:#D6E0EB; --ink-100:#EBF1F7;
  /* Status (제한적으로) */
  --warning-500:#E8943A; --danger-500:#E25C5C;

  /* Surface */
  --surface-glass:rgba(255,255,255,.48);
  --surface-glass-strong:rgba(247,251,255,.68);
  --surface-paper:rgba(255,255,255,.86);          /* Blink 추가: 편집기 */
  --border-light:rgba(255,255,255,.65);
  --border-blue:rgba(123,177,241,.20);
  --divider:rgba(70,130,210,.10);

  /* Radius */
  --radius-xs:8px; --radius-sm:12px; --radius-md:16px; --radius-lg:20px; --radius-xl:24px; --radius-full:999px;

  /* Shadow — 파란 빛 번짐, 검정 금지 */
  --shadow-xs:0 4px 12px rgba(31,87,174,.06);
  --shadow-sm:0 8px 24px rgba(31,87,174,.08);
  --shadow-md:0 18px 45px rgba(31,87,174,.11);
  --shadow-lg:0 28px 80px rgba(23,70,150,.16);
  --glow-blue:0 0 48px rgba(62,137,255,.22);
  --glow-mint:0 0 30px rgba(80,221,203,.28);

  /* Blur */
  --blur-sm:8px; --blur-md:16px; --blur-lg:24px;

  /* Motion */
  --ease-standard:cubic-bezier(.2,.8,.2,1);
  --dur-hover:160ms; --dur-ui:240ms;
}
```

## Depth 계층 → Blink 요소

| 계층 | 스타일 | Blink 요소 |
| --- | --- | --- |
| Background | 앱 배경 그라디언트 (창 전체, 고정) | AppShell |
| Normal Surface | `--surface-paper`, blur 없음에 가까움 | 편집기 paper, 설정 폼 카드 |
| Glass | `.glass` (rgba .44~.48, blur 20, radius 20) | Sidebar, 인포그래픽 카드, 백링크 패널 |
| Elevated Glass | `.glass-elevated` (rgba .66, blur 28, radius 24) | Search Palette, Dialog |
| Floating Chip | `.floating-chip` (rgba .72, blur 16, radius 16) | Bubble Menu, Toast, JobFailureChip, AIStatusChip |

Glass는 **계층을 만드는 도구**다. 같은 화면에 계층이 다른 요소가 겹칠 때만 쓴다.

## 앱 배경

원본의 "왼쪽 흰색 → 오른쪽 깊은 블루"를 유지하되, 오른쪽 끝을 `--blue-300` 수준으로 멈춘다. 편집기가 화면 오른쪽 넓은 영역을 차지하므로 `#2768CF`까지 가면 paper 가장자리 대비가 과해진다.

```css
.app-background {
  background:
    radial-gradient(circle at 85% 12%, rgba(58,126,235,.28) 0%, transparent 38%),
    radial-gradient(circle at 70% 80%, rgba(89,174,255,.20) 0%, transparent 42%),
    linear-gradient(115deg, #F7FBFF 0%, #EEF6FF 40%, #D4E8FE 75%, #9BC8FA 100%);
  background-attachment: fixed;
}
```

## 화면 구성

```text
┌──────────────┬────────────────────────────────────────────────┐
│ Sidebar      │                                                │
│ [glass]      │   ┌──────────────────────────────────────┐     │
│ 264px        │   │ Title (H3 28/650 Ink 900)   ● 저장됨  │     │
│              │   │                                      │     │
│ + New Note   │   │ paper (max-width 760px, 중앙)         │     │
│              │   │ Body 16/1.7 Ink 800                  │     │
│ Note A  ◀    │   │                                      │     │
│ Note B       │   │    ┌────────────────────────┐        │     │
│ …            │   │    │ 구체화  정리  시각화   │ chip    │     │
│              │   │    └────────────────────────┘        │     │
│ ⌘K Search    │   └──────────────────────────────────────┘     │
│ ● OpenAI     │                     app background             │
│ Settings     │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

- Sidebar: 폭 264px, 창 가장자리에서 12px 띄운 glass 패널 (radius 20).
- Paper: 최대 폭 760px, 상하 padding 48px, 좌우 64px, radius 24.
- 기본 간격 토큰은 원본 4px 스케일 그대로. 화면 내 주요 여백은 24/32/48px.

## Typography

- 폰트: `Inter, Pretendard, -apple-system, "Segoe UI", sans-serif`. **로컬 번들**(`@fontsource/inter`, `pretendard` woff2) — CSP `'self'`이므로 CDN 사용 불가.

| 용도 | Size / Weight / Line-height | 색 |
| --- | --- | --- |
| 노트 제목 | 28 / 650 / 1.3 | Ink 900 |
| 편집기 H1 / H2 / H3 | 24/700, 20/650, 17/650 | Ink 900 |
| 편집기 본문 | 16 / 400 / **1.7** | Ink 800 |
| Sidebar 제목 | 14 / 600 / 1.4 | Ink 800 |
| Sidebar 미리보기, 보조 | 13 / 400 / 1.45 | Ink 600 |
| Caption, 시각 | 12 / 500 / 1.4 | Ink 500 |
| 버튼 | 14~15 / 600 | — |

원본 시스템의 Display·H1(44px 이상)은 Blink에서 쓰지 않는다.

## 컴포넌트 규칙

| 컴포넌트 | 규칙 |
| --- | --- |
| Primary Button | Blue 500→600 그라디언트, radius 14, 높이 40(앱 UI 기준, 원본 48은 너무 큼), hover는 밝기 대신 `translateY(-1px)` + 그림자 확대 |
| Secondary Button | glass(rgba .45, blur 16), Ink 800 텍스트 |
| Icon | Lucide, stroke 1.75, 16/20px. 강조 아이콘만 36px 배경 박스(Blue 16%→5% 그라디언트, radius 10) |
| Bubble Menu | floating chip, 버튼 3개(아이콘 + 라벨). 잠긴 버튼은 Ink 500 + 🔒(Lucide `Lock`) + 툴팁 |
| Search Palette | glass-elevated, 폭 640, 상단 18vh 위치. 결과 hover `--blue-100`, 선택 `--blue-200`. 검색어 강조는 `--mint-50` 배경 + Ink 900 (색 텍스트 아님) |
| Toast | floating chip, 우하단, 4초 |
| Dialog | glass-elevated, 뒤 배경 `rgba(16,33,61,.18)` + blur 4 |
| Note Link | Blue 600 텍스트 + 1px `--blue-300` 밑줄, hover Blue 700. 깨진 링크는 Ink 500 + 취소선 |
| 입력 | radius 12, 배경 rgba(255,255,255,.7), focus 링 `0 0 0 3px rgba(66,129,231,.25)` |

## AI 상태 표현 (Blink의 핵심 인터랙션)

명세서 §9 "선택 영역 자체가 상태 표시기" + Cloud Glass의 "Mint = AI 활성".

| 상태 | 표현 |
| --- | --- |
| 처리 중 (`QUEUED`/`RUNNING`) | 범위 텍스트 opacity 1 → 0.4 → 1 (1.4s, 명세서 §9.2) + 배경 `rgba(66,129,231,.08)` ↔ `.18` + 범위 좌측 2px Mint 400 막대 |
| 적용 완료 | 교체된 범위(또는 삽입된 인포그래픽)에 `--glow-mint` + Mint 50 배경이 600ms 동안 페이드아웃 |
| 실패 | 범위에 `--warning-500` 점선 밑줄 + 범위 끝에 `JobFailureChip`(문구 + [재시도] [닫기]) |
| 적용 불가 | Toast만 (원문은 그대로이므로 범위 표시 없음) |
| Sidebar AIStatusChip | 설정 완료: Mint 500 점 + Provider·모델 / 미설정: Ink 300 점 + "AI 설정 필요" |

Pulse는 원본 모션 표의 Glow Pulse(3~5s)가 아니라 명세서의 **1.4s**를 쓴다. 장식이 아니라 "지금 처리 중"이라는 기능적 피드백이기 때문이다.

## 모션

| 대상 | Duration | Easing |
| --- | --- | --- |
| Hover | 160ms | ease-out |
| 팔레트·Dialog 열림 | 240ms (opacity + scale .98→1) | `--ease-standard` |
| Bubble Menu 등장 | 160ms (opacity + translateY 4px) | ease-out |
| AI Pulse | 1.4s infinite | ease-in-out |
| Commit glow | 600ms | ease-out |

- Floating Card(4~7s 부유)는 **편집 화면에서 쓰지 않는다.** 글 쓰는 동안 주변이 움직이면 방해가 된다. 빈 상태 일러스트에만 허용.
- `prefers-reduced-motion`: Pulse를 정적인 배경 tint(`.14`)로 대체, 등장 애니메이션 제거.

## 인포그래픽

인포그래픽은 PNG로 내보내므로 **SVG 속성에 직접 값을 쓴다**(CSS 변수·외부 CSS·backdrop-filter는 Canvas 변환에서 사라진다). 상수 SSOT: `features/visualization/theme/infographicTheme.ts`.

| 항목 | 값 |
| --- | --- |
| 배경(PNG) | `#F3F8FF` + 우상단 radial `rgba(66,129,231,.12)` |
| 노드 카드 | fill `#FFFFFF` opacity .9, stroke `rgba(123,177,241,.35)`, radius 16, padding 16, 간격 24, 그림자는 `<filter>` feDropShadow `rgba(31,87,174,.10)` |
| 노드 제목 / 설명 | 15/700 Ink 900, 13/400 Ink 700 |
| 강조 순서 팔레트 | Blue 700 → Blue 500 → Blue 400 → Blue 300 → Mint 500 (카테고리 구분 필요 시 이 순서) |
| 연결선 | 1.5px, `rgba(66,129,231,.45)`, 곡선(cubic) · 끝점 Mint 400 원(r=3) |
| 루트/시작 노드 | Blue 500→600 그라디언트 fill + 흰 텍스트 |
| 폰트 | `'Pretendard Variable', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif`. 화면 미리보기는 Pretendard, PNG는 SVG를 이미지로 그리므로 웹 폰트를 쓸 수 없어 OS 한글 글꼴로 그려진다. (웹 폰트 base64 내장은 크기 대비 이득이 작아 보류) |

## Blink 적용 시 조정 사항

| 원본 규칙 | Blink 적용 | 이유 |
| --- | --- | --- |
| 배경 오른쪽 끝 `#2768CF` | `#9BC8FA`에서 멈춤, radial 투명도 절반 | 편집기가 오른쪽 넓은 영역을 차지 → 장시간 읽기 피로 |
| 모든 주요 면 Glass | 편집기는 **거의 불투명한 paper**(rgba .86) | 반투명 위 긴 본문은 가독성이 떨어진다 (원본 §5 "완전 투명 금지"의 연장) |
| Primary Button 높이 48 | 40 | 랜딩 CTA가 아닌 앱 UI 밀도 |
| Floating Card 부유 모션 | 편집 화면 금지 | 글쓰기 집중 |
| 명세서 §18 시각화 팔레트(Blue·Purple·Green·Orange·Pink·Teal) | Blue 스케일 + Mint | 원본 금지 항목 "Cyan/Purple/Pink 동시 사용" 및 색 제한 원칙과 충돌. 명세서 §18을 이 문서로 대체 |
| 명세서 §18 Node Radius 12 | 16 | 원본 "카드마다 다른 Radius 금지" — 작은 카드 = Radius MD로 통일 |
| Warning/Error 색 미정 | `#E8943A`, `#E25C5C` 추가 | 원본이 "제한적으로 사용"만 명시 |

## 범위 밖

- 다크 모드: Phase 1은 라이트 전용. 토큰을 의미 이름(`--surface-*`, `--ink-*`)으로 쓰므로 추후 재정의로 추가 가능.
- 창 자체의 OS 투명 효과(macOS vibrancy, Windows Mica): 사용하지 않는다. 앱 배경 그라디언트가 Glass의 "뒤"를 제공한다.

## 성능 메모

`backdrop-filter`는 뒤 내용이 바뀔 때마다 다시 계산된다. 배경은 `fixed`로 고정되어 있고, 편집 중 스크롤되는 영역(paper)에는 blur를 쓰지 않으므로 타이핑·스크롤 비용이 없다. blur는 Sidebar, 오버레이, 칩에만 쓴다.
