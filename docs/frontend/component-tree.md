# Frontend — Component Tree

정확한 Props·타입은 코드가 SSOT다. 여기서는 **책임과 상태 소유**만 기록한다. 시각 스타일은 [design-system.md](design-system.md).

## AppShell

```text
App (QueryClientProvider, HashRouter)
└── AppShell                              ◆ 검색 팔레트 열림 · 전역 단축키 · 앱 종료 flush 응답
    ├── Sidebar                           [glass]
    │   ├── BrandMark
    │   ├── NewNoteButton                 → useCreateNote → navigate
    │   ├── NoteList                      ← useNoteList
    │   │   └── NoteListItem              title · preview · 상대 시각, active = route의 noteId
    │   ├── SearchButton                  ⌘K
    │   ├── AIStatusChip                  ← useProviderSettings  ("OpenAI · 모델" / "AI 설정 필요")
    │   └── SettingsLink
    ├── <Outlet/>                         NotePage | SettingsPage | EmptyState
    ├── SearchPalette (overlay)           [glass-elevated]  ← ActiveEditorContext
    └── Toaster                           [floating chip]
```

## NotePage (`#/notes/:noteId`)

```text
NotePage                                  ◆ ActiveEditorContext · LinkTitlesContext 제공
├── NoteHeader
│   ├── TitleInput                        → SaveQueue.markDirty
│   ├── SaveIndicator                     ← SaveQueue.status
│   └── NoteMenu → DeleteNoteDialog       ◆ Dialog 열림
├── NoteEditor                            [paper]  ◆ Tiptap 인스턴스 (key=noteId)
│   ├── EditorContent
│   │   ├── NoteLinkView (node view)      ← LinkTitlesContext, 클릭 → navigate / 깨진 링크 Toast
│   │   ├── InfographicView (node view)   → visualization
│   │   └── JobFailureChip (widget deco)  재시도 / 닫기
│   └── AIActionBubble (BubbleMenu)       [floating chip]  ← useActiveCapabilities
├── AssistBridge (렌더링 없음)             ← useNoteJobs · useJobEvents → 편집기에 상태 주입, Commit 실행
└── BacklinksPanel                        ← useNoteLinks (incoming)  (접이식, 하단)
```

- `AssistBridge`는 UI가 없는 조정 컴포넌트다. Job 이벤트 수신·Mark 해석·Commit이 편집기 컴포넌트에 섞이지 않도록 분리했다.
- `AIActionBubble`은 Job을 만들 때 Mark를 먼저 거는 일까지 담당한다 ([data-flow.md](data-flow.md#2-ai-작업-요청--완료--commit)).

## SearchPalette

```text
SearchPalette                             ◆ 입력값 · 선택 인덱스 · 미리보기 펼침
├── SearchInput                           debounce 200ms
├── SearchResultList                      ← useNoteSearch(query, excludeNoteId = 현재 노트)
│   └── SearchResultItem                  title · snippet(검색어 강조) · 시각
│       └── Actions: [열기] [연결] [내용 가져오기] [미리보기]
└── NotePreviewPane                       ← useNoteDetail(선택 결과)  읽기 전용 Tiptap
    └── [선택 영역 가져오기]
```

현재 노트가 없으면(설정 화면 등) `[연결]`, `[내용 가져오기]`를 숨기고 `[열기]`만 보인다.

## InfographicView

```text
InfographicView                           [glass card]
├── SpecGuard                             InfographicSpec.parse 실패 → "표시할 수 없는 인포그래픽"
├── InfographicSvg                        type별 분기
│   ├── ProcessRenderer
│   ├── HierarchyRenderer
│   ├── ComparisonRenderer                (SUPPORTED_TYPES에 추가될 때)
│   └── MindmapRenderer                   (SUPPORTED_TYPES에 추가될 때)
└── InfographicToolbar                    [PNG로 저장] [삭제]
```

렌더러는 **순수 함수형 컴포넌트**(spec → SVG)다. 레이아웃 계산(`layoutProcess(spec)` 등)은 React 밖 순수 함수로 두어 테스트한다.

## SettingsPage (`#/settings/ai`)

```text
SettingsPage
└── AIProviderForm                        ◆ 폼 초안
    ├── SecureStorageBanner               secureStorageAvailable === false
    ├── ProviderSelect                    OpenAI / Kimi
    ├── ApiKeyInput                       password, placeholder: hasApiKey ? "저장됨 · 변경하려면 입력" : "API Key"
    ├── ModelSelect                       카탈로그
    ├── CapabilityList                    선택 모델의 Capability (✓ / ✕)
    ├── BaseUrlField                      (고급, 접힘)
    ├── TestConnectionButton              ◆ 테스트 결과
    └── SaveButton
```

## UI States

| 화면 | loading | empty | error | 기타 |
| --- | --- | --- | --- | --- |
| NoteList | 스켈레톤 3줄 | "첫 노트를 만들어 보세요" + 새 노트 | 재시도 링크 | — |
| NotePage | paper 위 스켈레톤 | — | `NOTE_NOT_FOUND` → "노트를 찾을 수 없습니다" + 목록으로 / 그 외 → 재시도 | 저장 실패: SaveIndicator 경고 + 재시도 |
| SearchPalette | 이전 결과 유지 + 입력창 진행 표시 | 입력 전: 안내 / 결과 없음: "일치하는 노트가 없습니다" | 인라인 오류 | 결과 선택 키보드 이동(↑↓, Enter=열기) |
| AIActionBubble | — | — | — | 설정 없음: 전체 비활성 + "AI 설정 필요" / 기능 미지원: 해당 버튼 🔒 + 툴팁 / 입력 초과: 비활성 + "10,000자 이하로 선택" |
| AI 범위 | QUEUED/RUNNING: Pulse | — | FAILED: `JobFailureChip` | 적용 완료: 짧은 Mint glow / 적용 불가: Toast |
| InfographicView | — | — | Spec 무효 안내 | 저장 중 버튼 비활성, 취소는 무반응 |
| Settings | 폼 스켈레톤 | 최초: 모든 필드 비어 있음 | 필드별 오류 | 테스트 중 / 성공(Mint) / 실패(코드별 문구) |
