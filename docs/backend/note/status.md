# Note Domain — Status

보관함(.md) 방식 (D-14, 2026-09-30). 이전 SQLite 본문 방식의 구현은 제거했다 — `blink.db`의 옛 `notes`·`note_links` 테이블은 남아 있지만 읽지 않는다(자동 이전 없음).

| Use Case | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| UC-VAULT-001 보관함 열기 | Done | N/A | Done | Done | Done | Done |
| UC-VAULT-002 색인 맞추기 | Done | N/A | Done | N/A | Done | Done |
| UC-VAULT-003 외부 변경 반영 | Done | N/A | Done | Done | Done | Done (E2E) |
| UC-NOTE-001 노트 생성 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-002 목록(트리) | Done | N/A | Done | Done | Done | Done |
| UC-NOTE-003 상세 조회 | Done | N/A | Done | Done | Done | Done |
| UC-NOTE-004 본문 저장 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-005 삭제 | Done | N/A | Done | Done | Done | Done |
| UC-NOTE-006 검색 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-007 연결 | Done | Done | N/A | N/A | N/A | Done (E2E) |
| UC-NOTE-008 링크 조회 | Done | Done | Done | Done | Done | Done |
| UC-NOTE-009 내용 가져오기 | Done | N/A | N/A | N/A | N/A | Done (E2E) |
| UC-NOTE-010 이름 변경(링크 고치기) | Done | Done | Done | Done | Done | Done (E2E) |
| UC-NOTE-011 노트 이동 | Done | Done | Done | Done | Done | Done |
| UC-FOLDER-001~003 폴더 | Done | Done | Done | Done | Done | Done (E2E) |

## 구현 위치

- Domain: `src/main/note/domain/{names,note-path,markdown-content,note-text,search-query}.ts`, Shared Kernel `src/shared/notes/wiki-link.ts`
- Application: `src/main/note/application/vault/` — `IndexSync`, `VaultNoteService`, `FolderService`, `link-maintenance`, `VaultManager`
- Infrastructure: `src/main/note/infrastructure/vault/` — 파일 시스템(원자적 쓰기·감시), 색인 DB, 앱 설정 JSON, `openNoteVault`
- Presentation: `src/main/note/presentation/note.ipc.ts` (vault·note·folder 채널)
- AI Job은 열린 보관함의 색인 DB에 저장된다 (`SessionAIJobRepository`). 보관함을 열 때 중단된 Job을 정리한다.

## 알려진 제약

- 링크 고치기는 Blink 안에서 이름을 바꾸거나 옮길 때만 한다. 다른 앱에서 파일 이름을 바꾸면 새 노트로 인식된다(ID·AI Job 이력이 이어지지 않음).
- 보관함을 바꾸는 동안 끝난 옛 보관함의 AI Job 결과는 버려지고, 다음에 그 보관함을 열 때 중단됨으로 정리된다.
