# AI Provider Domain — API Contract (IPC)

## 타입

```ts
type ProviderId = 'openai' | 'kimi';
type Capability = 'generate' | 'structuredOutput' | 'webSearch';
type Capabilities = { generate: boolean; structuredOutput: boolean; webSearch: boolean };

type ProviderSettingsView = {
  secureStorageAvailable: boolean;
  active: { provider: ProviderId; model: string; capabilities: Capabilities } | null;
  providers: {
    provider: ProviderId;
    label: string;                          // 'OpenAI', 'Kimi'
    isActive: boolean;
    model: string | null;                   // 아직 설정 안 했으면 null
    baseUrl: string | null;
    hasApiKey: boolean;                     // Key 자체는 절대 반환하지 않음
    models: { id: string; label: string; capabilities: Capabilities }[];   // 카탈로그
  }[];
};
```

## 채널

| 채널 | Preload | 요청 | 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `settings:get-provider` | `settings.getProvider` | `{}` | `ProviderSettingsView` | — |
| `settings:update-provider` | `settings.updateProvider` | `{ provider: ProviderId; model: string; apiKey?: string; baseUrl?: string \| null }` | `ProviderSettingsView` | `PROVIDER_MODEL_NOT_SUPPORTED`, `PROVIDER_API_KEY_REQUIRED`, `PROVIDER_SECURE_STORAGE_UNAVAILABLE`, `PROVIDER_BASE_URL_INVALID` |
| `settings:test-provider` | `settings.testProvider` | `{ provider: ProviderId; model: string; apiKey?: string; baseUrl?: string }` | `{ ok: true } \| { ok: false; failure: { code: 'AUTH_FAILED' \| 'MODEL_NOT_FOUND' \| 'RATE_LIMITED' \| 'UNAVAILABLE' \| 'TIMEOUT' } }` | `PROVIDER_MODEL_NOT_SUPPORTED`, `PROVIDER_API_KEY_REQUIRED`, `PROVIDER_BASE_URL_INVALID` |

- `apiKey` 생략 = 기존 Key 유지. 빈 문자열은 `VALIDATION_FAILED`.
- `baseUrl: null` = 기본값으로 초기화, 생략 = 유지.

## 오류 코드

| code | 의미 |
| --- | --- |
| `PROVIDER_MODEL_NOT_SUPPORTED` | 카탈로그에 없는 모델 |
| `PROVIDER_API_KEY_REQUIRED` | 입력 Key도, 저장된 Key도 없음 |
| `PROVIDER_SECURE_STORAGE_UNAVAILABLE` | OS 보안 저장소 사용 불가 → Key 저장 거부 |
| `PROVIDER_BASE_URL_INVALID` | BR-AIP-04 위반 |

## 명세서 §32 대비 변경

| 명세서 | 설계 |
| --- | --- |
| `settings:get-provider` | 모든 Provider 요약 + 카탈로그 + 활성 Capability 포함 (모델 목록 채널 불필요) |
| `settings:update-provider` | 저장한 Provider를 활성화 |
| `settings:test-provider` | 저장 전 Key로도 테스트 가능, 실패는 결과 값으로 반환 |
| `window.blink.settings.saveProvider()` (§33) | `settings.updateProvider()` 로 이름 통일 |
