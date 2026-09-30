# AI Provider Domain — Application Flows

## 포트

```ts
/** assist가 사용하는 LLM 추상화. 구현: OpenAIProvider, KimiProvider */
interface LLMProvider {
  testConnection(signal: AbortSignal): Promise<void>;
  generateText(req: { system: string; user: string; signal: AbortSignal }): Promise<string>;
  generateStructured(req: {
    system: string; user: string;
    schemaName: string; jsonSchema: object;           // Zod → JSON Schema (visualization 제공)
    signal: AbortSignal;
  }): Promise<unknown>;                               // 파싱된 JSON. 검증은 호출자 책임
  researchAndGenerate(req: { system: string; user: string; signal: AbortSignal }):
    Promise<{ text: string; sources: { title: string; url: string }[] }>;
}

/** 어댑터가 던지는 유일한 오류 타입. SDK 예외를 여기서 변환한다. */
class ProviderError extends Error {
  kind: 'AUTH' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'BAD_RESPONSE' | 'UNSUPPORTED';
}

interface LLMProviderFactory {
  create(provider: ProviderId, cfg: { apiKey: string; model: ModelId; baseUrl?: string }): LLMProvider;
  catalog(): ModelCatalog;
}

interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): EncryptedSecret;
  decrypt(secret: EncryptedSecret): string;
}
```

명세서 §28 대비: `getCapabilities()` → `ModelCatalog`, 선택적 `searchAndGenerate?` → 필수 `researchAndGenerate`(미지원 모델에서는 호출 전에 Capability로 걸러지며, 호출되면 `UNSUPPORTED`), `generate` → 텍스트/구조화 두 메서드로 분리(구조화 출력은 요청 형태가 다르다).

## UC-AIP-001 Get Settings

```text
settings:get-provider
→ ProviderSettingsService.get()
   → settings = repo.load()
   → view(settings, factory.catalog(), cipher.isAvailable())
```

## UC-AIP-002 Update Provider

```text
settings:update-provider (Zod: provider enum, model string, apiKey? string(1..500), baseUrl? string|null)
→ ProviderSettingsService.update(cmd)
   → if cmd.apiKey:
        if !cipher.isAvailable() → PROVIDER_SECURE_STORAGE_UNAVAILABLE
        encrypted = cipher.encrypt(cmd.apiKey.trim())
   → settings = repo.load()
   → settings.configure({ provider, model, encrypted, baseUrl }, factory.catalog(), now)
   → repo.save(settings)
→ ProviderSettingsView
```

## UC-AIP-003 Test Connection

```text
settings:test-provider (Zod: provider, model, apiKey?, baseUrl?)
→ ProviderSettingsService.test(cmd)
   → factory.catalog().require(provider, model)
   → key = cmd.apiKey ?? decrypt(repo.load().entryOf(provider)?.apiKey) ?? PROVIDER_API_KEY_REQUIRED
   → client = factory.create(provider, { apiKey: key, model, baseUrl })
   → await withTimeout(client.testConnection(signal), 10s)
        ok                         → { ok: true }
        ProviderError(kind) / Timeout → { ok: false, failure: { code } }
```

## UC-AIP-004 ActiveLLM (타 도메인 공개 API)

```ts
interface ActiveLLM {
  /** 없으면 DomainError(AI_PROVIDER_NOT_CONFIGURED) */
  resolve(): ActiveModel;
  /** 없으면 null (Runner용) */
  tryResolve(): ActiveModel | null;
}
type ActiveModel = { provider: ProviderId; model: ModelId; capabilities: ModelCapabilities; client: LLMProvider };
```

```text
resolve():
  settings = repo.load(); entry = settings.active()        ?? NOT_CONFIGURED
  descriptor = catalog.find(entry.provider, entry.model)   ?? NOT_CONFIGURED  // 앱 업데이트로 모델이 카탈로그에서 빠진 경우
  apiKey = cipher.decrypt(entry.apiKey)                    // 실패 → NOT_CONFIGURED + 로그
  return { ..., capabilities: descriptor.capabilities, client: factory.create(...) }
```

매 호출 시 복호화·어댑터 생성을 한다. 비용이 작고, 설정 변경 즉시 반영되며, 평문 Key를 오래 메모리에 두지 않는다.

## 어댑터 책임

| 책임 | 내용 |
| --- | --- |
| 요청 변환 | `system`/`user` → Provider API 형식 |
| 구조화 출력 | Provider의 JSON Schema 기반 출력 기능 사용, 응답 텍스트 `JSON.parse` |
| Web Search | Provider 내장 web search tool 사용, 응답의 인용(citation)에서 `sources` 추출 |
| 오류 변환 | HTTP 401/403 → `AUTH`, 404(모델) → `MODEL_NOT_FOUND`, 429 → `RATE_LIMIT`, 네트워크/5xx → `UNAVAILABLE`, 파싱 실패 → `BAD_RESPONSE` |
| 취소 | `AbortSignal`을 SDK/fetch에 전달 |
| 보안 | 오류 메시지·로그에 Key, Authorization 헤더, 요청 본문을 넣지 않는다 |

Kimi(Moonshot) API는 OpenAI 호환 형식이므로 `KimiProvider`는 OpenAI SDK에 `baseURL`만 바꿔 재사용하되, Web Search 도구 정의와 인용 추출은 별도로 구현한다.
