# AI Provider Domain — Status

| Use Case | Design | Domain | Application | API | Persistence | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| UC-AIP-001 설정 조회 | Done | Done | Done | Done | Done | Done |
| UC-AIP-002 설정 저장 | Done | Done | Done | Done | Done | Done |
| UC-AIP-003 연결 테스트 | Done | N/A | Done | Done | N/A | Done |
| UC-AIP-004 ActiveLLM | Done | Done | Done | N/A | Done | Done |
| OpenAIProvider 어댑터 | Done | N/A | N/A | N/A | N/A | Done (가짜 fetch) |
| KimiProvider 어댑터 | Done | N/A | N/A | N/A | N/A | Done (가짜 fetch) |

명세서 §38 구현 순서 매핑: Step 7 → UC-AIP-001~004 + OpenAIProvider, Step 14 → KimiProvider.

## 구현 메모
- 실제 OpenAI API 호출은 이 저장소의 테스트에서 하지 않는다. 어댑터는 가짜 `fetch`로 요청 형식·오류 매핑을 검증하고, E2E는 `BLINK_FAKE_LLM=1`(개발 빌드 전용) 가짜 LLM으로 흐름 전체를 검증한다. 실제 Key로의 연결 확인은 사람이 설정 화면의 `연결 테스트`로 한다.
- Kimi(2026-09 문서 기준): OpenAI 호환 Chat Completions(`https://api.moonshot.ai/v1`, 중국은 Base URL에 `https://api.moonshot.cn/v1`). 구조화 출력은 `response_format: json_schema`(strict). 내장 `$web_search`는 공식 문서가 권장하지 않아, 구체화는 **공식 검색 API `POST /v1/tools/search`로 먼저 찾고 그 결과만 근거로 다시 쓰게** 한다 — 검색 결과가 곧 출처다(결과가 없으면 `BAD_RESPONSE`로 실패). `kimi-k2.6`은 응답 속도를 위해 `thinking: {type: 'disabled'}`를 보내고, 항상 추론하는 `kimi-k3`에는 보내지 않는다. 연결 테스트는 `GET /models`에 모델이 있는지 본다. moonshot-v1 계열은 2026-08-31 종료되어 카탈로그에 넣지 않았다.
- OpenAI 카탈로그(`openai-provider.ts`의 `OPENAI_MODELS`)는 SDK 타입의 모델 목록에서 골랐다. Capability(특히 web search 지원)는 모델 라인업이 바뀌면 이 목록만 고친다.
