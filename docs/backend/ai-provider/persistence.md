# AI Provider Domain — Repository & Persistence

## Repository Contract

```ts
interface AIProviderSettingsRepository {
  load(): AIProviderSettings;          // 행이 없으면 빈 설정
  save(settings: AIProviderSettings): void;   // 단일 트랜잭션: entries UPSERT + is_active 갱신
}
```

애그리거트가 설정 전체이므로 `load/save` 두 개면 충분하다.

## `ai_provider_settings`

| 컬럼 | 타입 | 제약 | 비고 |
| --- | --- | --- | --- |
| `provider` | TEXT | PK, CHECK IN (`openai`,`kimi`) | 명세서의 `id` 대신 Provider가 식별자 |
| `model` | TEXT | NOT NULL | |
| `base_url` | TEXT | NULL | |
| `encrypted_api_key` | BLOB | NULL | `safeStorage.encryptString` 결과 |
| `is_active` | INTEGER | NOT NULL DEFAULT 0 | 0/1 |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |

- `CREATE UNIQUE INDEX uq_ai_provider_active ON ai_provider_settings(is_active) WHERE is_active = 1;` — 활성 1개를 DB에서도 보장.
- `save()`는 `UPDATE … SET is_active = 0` 후 대상만 1로 설정한다(같은 트랜잭션).
- `CHECK (is_active = 0 OR encrypted_api_key IS NOT NULL)`

## 보안 메모

`safeStorage`의 암호화 키는 OS 사용자 계정에 묶여 있다(Windows DPAPI, macOS Keychain). DB 파일을 다른 PC로 복사하면 Key를 복호화할 수 없다 → `ActiveLLM`이 `AI_PROVIDER_NOT_CONFIGURED`를 반환하고 사용자는 Key를 다시 입력한다. 의도된 동작이다.
