# 05. Cross-Cutting Concerns

## 보안

Renderer는 신뢰하지 않는 경계로 취급한다(노트 본문·LLM 결과가 렌더링되는 곳이기 때문).

| 항목 | 규칙 |
| --- | --- |
| BrowserWindow | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` |
| IPC 발신자 검증 | 모든 핸들러에서 `event.senderFrame`이 앱 자체 origin인지 확인. 아니면 무시 |
| CSP | `default-src 'self'`; 외부 스크립트·원격 콘텐츠 로드 금지 |
| 외부 링크 | `setWindowOpenHandler`로 차단하고 `shell.openExternal`로 http(s)만 허용 (구체화 출처 링크) |
| API Key | Main에서만 복호화. IPC 응답·로그·오류 메시지에 절대 포함하지 않음 ([ai-provider/cross-cutting.md](ai-provider/cross-cutting.md)) |
| LLM 출력 | 신뢰하지 않는 입력. Markdown은 Renderer가 편집기 스키마로 파싱(HTML 직접 삽입 금지), Spec은 Zod + 도메인 불변식 검증 |

## 검증 (3단계 분리)

| 단계 | 위치 | 예 | 실패 코드 |
| --- | --- | --- | --- |
| 전송 검증 | presentation (Zod 스키마, `src/shared/ipc`) | 타입, 필수 필드, UUID 형식, enum 값 | `VALIDATION_FAILED` |
| 애플리케이션 검증 | application | 참조 대상 존재(노트), 활성 Provider 존재 | `NOTE_NOT_FOUND`, `AI_PROVIDER_NOT_CONFIGURED` |
| 도메인 검증 | domain 생성자/행위 | 제목 길이, 본문 크기, 상태 전이, Capability 요구, Spec 구조 | 도메인별 코드 |

같은 규칙을 두 번 쓰지 않는다. 비즈니스 의미가 있는 제약(예: 제목 200자)은 도메인에만 둔다. 전송 검증은 모양만 본다.

## 오류 처리

- 도메인/애플리케이션은 `DomainError(code, message)`를 throw 한다.
- presentation의 공통 `handle()` 헬퍼가 `DomainError` → Envelope, 그 외 → `INTERNAL_ERROR`로 변환한다.
- SQLite/Drizzle/HTTP SDK 예외는 infrastructure 경계에서 잡아 의미 있는 코드로 변환하거나 `INTERNAL_ERROR`로 둔다. **ORM 예외 메시지를 Renderer에 노출하지 않는다.**
- AI 작업 실패는 IPC 오류가 아니라 **Job의 상태(`FAILED` + `failure.code`)** 로 표현한다. `ai:create-job` 자체는 성공한다.

## 트랜잭션

- 기본 경계는 **유스케이스 1회 실행**. 단, 실제로 여러 쓰기가 있는 곳만 트랜잭션을 연다.
- 현재 원자성이 필요한 곳: 노트 저장(노트 행 + 링크 재계산) → `NoteRepository.save()` 내부 단일 트랜잭션.
- LLM 호출은 **절대 DB 트랜잭션 안에서 하지 않는다.** Job Runner는 `start 저장 → (트랜잭션 밖) LLM 호출 → complete/fail 저장`으로 나눈다.

## 동시성

| 상황 | 해결 |
| --- | --- |
| 자동 저장 경합 | 노트 본문 작성자는 Renderer 하나(D-04). Renderer는 저장 요청을 직렬화한다(이전 저장 완료 후 다음 저장). Main은 last-write-wins |
| AI 결과와 사용자 편집 경합 | Pending Mark 범위는 편집 불가(Selection Lock). 결과는 Renderer가 적용하므로 Main과 경합 없음 |
| 동시 AI Job | Job Runner 전역 동시 실행 상한 2. 초과분은 `QUEUED`로 대기 (FIFO) |
| 다중 창 | Phase 1은 단일 창. 다중 창 지원 시 노트 `revision` 기반 낙관적 잠금 도입 |

## 로깅

- `electron-log`로 Main에서 파일 로그. 레벨: `error`, `warn`, `info`.
- **기록하지 않는 것:** API Key, 노트 본문, 선택 텍스트, LLM 응답 본문.
- **기록하는 것:** 채널명, 소요 시간, Job ID·유형·상태 전이, Provider/모델, 오류 코드, HTTP 상태 코드.

## 설정/데이터 위치

| 항목 | 위치 |
| --- | --- |
| DB | `app.getPath('userData')/blink.db` |
| 로그 | `app.getPath('logs')` |
| 마이그레이션 | 앱 번들 내 SQL (drizzle-kit 생성), 시작 시 적용 |

## 테스트 전략

| 종류 | 대상 | 도구 |
| --- | --- | --- |
| Domain | Note, NoteContent 파생, AIJob 상태 전이, InfographicSpec 불변식, AIProviderSettings 규칙 | Vitest, 프레임워크·DB 없음 |
| Application | 유스케이스 오케스트레이션, Job Runner (Fake LLMProvider, In-memory Repo, Fake Clock) | Vitest |
| Integration | Drizzle Repository (in-memory SQLite), FK cascade, 마이그레이션 | Vitest + better-sqlite3 `:memory:` |
| Adapter | OpenAI/Kimi 어댑터 요청·응답 매핑 | 녹화된 HTTP 응답(msw) |
| IPC 계약 | 핸들러 입력 검증과 Envelope 매핑 | Vitest (핸들러 함수 직접 호출) |
