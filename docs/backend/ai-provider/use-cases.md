# AI Provider Domain — Use Cases

---

## UC-AIP-001 AI 설정 조회

- **Actor:** 사용자 / Renderer (앱 시작 시 Capability 확인)
- **Trigger:** Settings > AI 진입, 앱 시작, 설정 저장 후
- **Main Flow:** 활성 Provider와 모델·Capability, Provider별 설정 요약(`hasApiKey` 포함), 모델 카탈로그, 보안 저장소 사용 가능 여부를 반환한다.
- **Postconditions:** Renderer는 활성 Capability로 Bubble Menu 버튼을 잠근다(예: `webSearch` 없으면 `구체화 🔒`).

## UC-AIP-002 Provider 설정 저장

- **Actor:** 사용자
- **Trigger:** Settings > AI에서 Provider·API Key·Model 입력 후 저장
- **Preconditions:** —
- **Main Flow:**
  1. 모델이 해당 Provider 카탈로그에 있는지 확인한다.
  2. API Key가 입력되었으면 암호화한다.
  3. `settings.configure(provider, model, apiKey?, baseUrl?)` — Provider 설정을 추가/갱신하고 활성 Provider로 지정한다.
  4. 저장 후 UC-AIP-001과 같은 정보를 반환한다.
- **Alternative Flow:**
  - API Key 미입력 + 기존 Key 있음 → 기존 Key 유지 (모델만 변경 등).
  - `baseUrl: null` → 기본 URL로 되돌림.
- **Failure Cases:** `PROVIDER_MODEL_NOT_SUPPORTED`, `PROVIDER_API_KEY_REQUIRED`(기존 Key도 없음), `PROVIDER_SECURE_STORAGE_UNAVAILABLE`, `PROVIDER_BASE_URL_INVALID`
- **Business Rules:** BR-AIP-01~04
- **Postconditions:** 이후 생성·시작되는 AI Job은 새 설정을 사용한다. 이미 실행 중인 Job은 영향 없음.

## UC-AIP-003 연결 테스트

- **Actor:** 사용자
- **Trigger:** `Test Connection`
- **Main Flow:**
  1. 입력 중인(저장 전) Key가 있으면 그 Key로, 없으면 저장된 Key로 어댑터를 만든다.
  2. 최소 요청을 보낸다(제한 시간 10초).
  3. 성공/실패 코드를 반환한다. **아무것도 저장하지 않는다.**
- **Failure (결과로 반환):** `AUTH_FAILED`, `MODEL_NOT_FOUND`, `RATE_LIMITED`, `UNAVAILABLE`, `TIMEOUT`
- **Failure (IPC 오류):** `PROVIDER_API_KEY_REQUIRED`(입력·저장 Key 모두 없음), `PROVIDER_MODEL_NOT_SUPPORTED`
- **Note:** 연결 실패는 "요청은 정상 처리되었고 결과가 실패"이므로 IPC 오류가 아니라 `{ ok: false }` 결과다.

## UC-AIP-004 활성 LLM 해석 (내부)

- **Actor:** assist (`CreateAIJob`, `RetryAIJob`, `JobRunner`)
- **Main Flow:** 활성 설정 → Key 복호화 → 어댑터 생성 → `{ provider, model, capabilities, client }` 반환.
- **Failure:** 활성 Provider 없음/Key 없음/복호화 실패 → `AI_PROVIDER_NOT_CONFIGURED`

---

## Business Rules

| ID | 규칙 |
| --- | --- |
| BR-AIP-01 | 활성 Provider는 최대 1개이며, 활성 Provider는 반드시 API Key를 가진다. |
| BR-AIP-02 | 모델은 해당 Provider 카탈로그에 있어야 한다. Capability는 카탈로그 값이다. |
| BR-AIP-03 | API Key는 암호화된 형태로만 저장한다. 보안 저장소가 없으면 저장을 거부한다. |
| BR-AIP-04 | Base URL을 지정하면 `https://` URL이어야 한다(로컬 프록시 등을 위한 `http://localhost`는 허용). |
| BR-AIP-05 | API Key는 IPC 응답, 로그, 오류 메시지에 포함하지 않는다. |
