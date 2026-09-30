# Frontend — Route Map

Renderer는 **Electron + React + Vite 단일 페이지 앱**이다. Next.js/Nuxt가 아니므로 SSR·SSG가 없고, 라우팅은 창 내부 화면 전환 용도다.

- 라우터: React Router, **Hash Router** (`file://`로 로드되는 프로덕션 빌드에서 history 경로가 동작하지 않음)
- 인증: 없음 (로컬 단일 사용자 앱)
- URL을 쓰는 이유: 공유가 아니라 **노트 간 이동의 뒤로/앞으로**(링크 클릭 → 원래 노트로 복귀)와 "현재 노트"의 단일 출처

## Routes

| Route | 화면 | 관련 Use Case | Layout | Primary Data | Main Actions |
| --- | --- | --- | --- | --- | --- |
| `#/` | 시작 | UC-NOTE-002 | AppShell | 노트 목록 | 가장 최근 노트로 redirect, 노트가 없으면 빈 상태 + `새 노트` |
| `#/notes/:noteId` | 노트 편집 | UC-NOTE-003·004·005·007·008·009, UC-ASSIST-001~005, UC-VIS-001 | AppShell | 노트 상세, 이 노트의 AI Job, 링크 | 편집(자동 저장), 제목 변경, 삭제, AI 작업, 검색·연결·가져오기, PNG 저장 |
| `#/settings/ai` | AI 설정 | UC-AIP-001~003 | AppShell | Provider 설정 | 저장, 연결 테스트 |
| `*` | — | — | — | — | `#/`로 redirect |

## Route가 아닌 화면 요소

| 요소 | 형태 | 이유 |
| --- | --- | --- |
| 노트 검색 (Search Palette) | AppShell 위 오버레이 (`⌘/Ctrl + K`, Sidebar의 Search) | 현재 노트 위에서 열려 **현재 편집기에 연결/삽입**해야 한다. 라우트를 바꾸면 편집 맥락을 잃는다 |
| 삭제 확인 | Dialog | 일시적 확인 |
| 알림 (저장 실패, AI 실패, 적용 불가) | Toast | 일시적 |

## Layout

```text
AppShell (배경 그라디언트 공간)
├── Sidebar (glass)      ← 모든 route에서 유지
└── <Outlet />           ← route 화면
+ SearchPalette overlay
+ Toaster
```

Settings도 Sidebar를 유지한다. 설정 저장 직후 노트로 돌아가는 흐름(명세서 Scenario 8)이 한 번의 클릭이어야 하기 때문이다.

## 보관함 게이트 (D-14)

라우트보다 바깥에 **보관함 게이트**가 있다. `vault:get-current`가 `null`이면 라우터 대신 **보관함 선택 화면**을 보인다: `폴더 열기`(Main Dialog) + 최근 보관함 목록(사라진 폴더는 흐리게). 보관함을 열거나 바꾸면 Query 캐시 전체를 비우고 `#/`로 간다.
