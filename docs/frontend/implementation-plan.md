# Frontend — Implementation Plan

백엔드 구현 순서(명세서 §38)와 맞물리도록 짰다. 각 단계는 **Mock으로 먼저 동작**하고, 해당 백엔드 유스케이스가 완료되면 실제 IPC로 확인한다.

| # | 단계 | 산출물 | 백엔드 의존 | 완료 확인 |
| --- | --- | --- | --- | --- |
| 1 | 기반 | Vite + React + TS, HashRouter, QueryClientProvider, `tokens.css`, 폰트 번들, `BlinkApi` 접근점 + `createMockBlink` | `src/shared/ipc` 타입 | 브라우저 dev에서 Mock으로 뜬다 |
| 2 | AppShell | 배경, Sidebar, NoteList, NewNote, 빈 상태, 라우트 3개 | UC-NOTE-001·002 | 노트 생성 → 목록 최상단 |
| 3 | 편집 · 자동 저장 | `createEditor`(StarterKit), NotePage, NoteHeader, `AutosaveRegistry`/`SaveQueue`, SaveIndicator, 삭제 Dialog, **앱 종료 flush** | UC-NOTE-003·004·005, `app:*` | 명세서 Scenario 1 (종료 → 재실행 → 유지) |
| 4 | 검색 | SearchPalette, 단축키, 결과·스니펫 강조, 열기 | UC-NOTE-006 | Scenario 5 |
| 5 | 연결 · 가져오기 | `noteLinkNode` + NoteLinkView, LinkTitlesContext, BacklinksPanel, 가져오기(전체·선택), `sanitizeImportedContent` | UC-NOTE-008 | Scenario 6·7, 깨진 링크 표시 |
| 6 | AI 설정 | SettingsPage, AIProviderForm, 연결 테스트, AIStatusChip, `useActiveCapabilities` | UC-AIP-001~003 | Scenario 8 |
| 7 | AI 작업 (정리) | AIActionBubble, `aiPendingMark`, selectionLock, jobDecoration(Pulse), `useJobEvents`, AssistBridge, `planCommit`/`applyCommit`, JobFailureChip | UC-ASSIST-001~006 (ORGANIZE) | Scenario 2 — 처리 중 다른 부분 편집, 노트 전환 후 복귀 시 적용 |
| 8 | 구체화 | 출처 목록 포함 Markdown 적용, 잠금 버튼(🔒) | EXPAND | Scenario 3 |
| 9 | 시각화 | `infographicNode` + InfographicView, SpecGuard, Process·Hierarchy 렌더러와 레이아웃 함수, 인포그래픽 테마 | VISUALIZE | Scenario 4 (Preview까지) |
| 10 | PNG 저장 | `svgToPng`, 폰트 내장, InfographicToolbar | UC-VIS-001 | Scenario 4 (PNG 저장) |
| 11 | 마감 | reduced-motion, 키보드 탐색, 오류 코드 매핑 점검, E2E | 전체 | 아래 E2E 통과 |

단계 7은 백엔드의 "정리(Step 8) + Job Manager(Step 9)를 함께 구현" 권장([assist/status.md](../backend/assist/status.md))과 짝을 이룬다.

## 테스트

| 우선순위 | 대상 | 도구 |
| --- | --- | --- |
| 1 | 순수 로직: `planCommit`, `sanitizeImportedContent`, `canRunJob`, 인포그래픽 레이아웃 함수, `SaveQueue`(직렬화·flush·cancel) | Vitest |
| 2 | 편집기 확장: Selection Lock이 잠긴 범위 편집·Undo를 거부하고 `aiCommit` 트랜잭션은 허용 | Vitest + 헤드리스 Tiptap |
| 3 | 흐름: Mock Blink로 AI 요청 → 이벤트 → Commit, 검색 → 연결 | Vitest + Testing Library |
| 4 | E2E (Playwright Electron, Fake LLM 어댑터) | 명세서 §41 Scenario 1~8 |

Presentational 컴포넌트 단위 테스트는 강제하지 않는다.
