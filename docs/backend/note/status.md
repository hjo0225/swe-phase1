# Note Domain — Status

| Use Case | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| UC-NOTE-001 노트 생성 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-002 목록 조회 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-003 상세 조회 | Done | N/A | Done | Done | Done | Done |
| UC-NOTE-004 저장(자동 저장, 링크 파생) | Done | Done | Done | Done | Done | Done |
| UC-NOTE-005 삭제 | Done | N/A | Done | Done | Done | Done |
| UC-NOTE-006 검색 | Done | Pending | Pending | Pending | Pending | Pending |
| UC-NOTE-007 노트 연결 | Done | N/A (UC-004) | N/A | N/A (Renderer) | N/A | Pending |
| UC-NOTE-008 링크 목록 조회 | Done | N/A | Pending | Pending | Pending | Pending |
| UC-NOTE-009 내용 가져오기 | Done | N/A | N/A | N/A (Renderer) | N/A | Pending |

명세서 §38 구현 순서 매핑: Step 2 → UC-001~005, Step 4 → UC-006, Step 5 → UC-007~009.

앱 종료 flush(D-12): Done — `e2e/scenario-1-notes.e2e.ts`가 debounce 전에 창을 닫아도 편집이 남는 것을 실제 Electron으로 검증한다.
