# AI Provider Domain — Domain Model

## Aggregate: AIProviderSettings

설정 전체를 하나의 애그리거트로 둔다. "활성 Provider는 하나"라는 규칙이 여러 Provider 설정에 걸쳐 있기 때문이다.

| 항목 | 내용 |
| --- | --- |
| Responsibility | Provider별 설정 보관과 활성 Provider 지정의 일관성 |
| State | `entries: Map<ProviderId, ProviderSetting>`, `activeProvider: ProviderId \| null` |
| Behavior | `configure(input, catalog, now)`, `active(): ProviderSetting \| null`, `entryOf(provider)` |
| Invariants | BR-AIP-01 (활성은 최대 1개, 활성은 Key 보유), BR-AIP-02 (모든 entry의 모델은 카탈로그에 있음) |

```ts
configure({ provider, model, encryptedApiKey?, baseUrl? }, catalog, now):
  catalog.require(provider, model)                    // PROVIDER_MODEL_NOT_SUPPORTED
  entry = entries.get(provider) ?? ProviderSetting.new(provider)
  entry = entry.withModel(model).withBaseUrl(baseUrl)
  if encryptedApiKey: entry = entry.withApiKey(encryptedApiKey)
  if !entry.hasApiKey: throw PROVIDER_API_KEY_REQUIRED
  entries.set(provider, entry); activeProvider = provider
```

## Entity: ProviderSetting

| 필드 | 설명 |
| --- | --- |
| `provider: ProviderId` | `'openai' \| 'kimi'` — 식별자 |
| `model: ModelId` | 카탈로그의 모델 ID |
| `baseUrl: BaseUrl \| null` | null이면 어댑터 기본값 |
| `apiKey: EncryptedSecret \| null` | 암호문. 도메인은 평문을 보지 않는다 |
| `createdAt`, `updatedAt` | |

## Value Objects

### ModelCapabilities

```ts
type Capability = 'generate' | 'structuredOutput' | 'webSearch';

class ModelCapabilities {
  constructor(readonly generate: boolean, readonly structuredOutput: boolean, readonly webSearch: boolean) {}
  supportsAll(required: Capability[]): boolean;
  missing(required: Capability[]): Capability[];   // AI_CAPABILITY_UNSUPPORTED details
}
```

### ModelCatalog

```ts
type ModelDescriptor = { id: ModelId; label: string; capabilities: ModelCapabilities };

class ModelCatalog {
  modelsOf(provider: ProviderId): ModelDescriptor[];
  find(provider, model): ModelDescriptor | null;
  require(provider, model): ModelDescriptor;       // 없으면 PROVIDER_MODEL_NOT_SUPPORTED
}
```

카탈로그 **내용**(어떤 모델이 무엇을 지원하는지)은 각 어댑터가 정적 데이터로 제공하고 bootstrap에서 합친다. Provider의 모델 라인업이 바뀌면 어댑터 파일만 고친다. 기본 원칙:

| Provider | Web Search 구현 |
| --- | --- |
| OpenAI | Responses API의 내장 web search tool을 지원하는 모델만 `webSearch: true` |
| Kimi | 내장 web search tool을 지원하는 모델만 `webSearch: true` |

### EncryptedSecret

- 불투명한 바이트(`Uint8Array`). 도메인은 비교·복호화하지 않는다. 암·복호화는 `SecretCipher` 포트(infrastructure: `safeStorage`)가 한다.

### BaseUrl

- BR-AIP-04 검증. 끝의 `/` 정규화.

## 관계

```text
AIProviderSettings 1 ── * ProviderSetting ── 1 ModelDescriptor (catalog, 참조)
         │
         └── activeProvider ──▶ ProviderSetting
```
