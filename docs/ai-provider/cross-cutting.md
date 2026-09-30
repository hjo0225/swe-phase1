# AI Provider Domain — Cross-Cutting (Security)

## API Key 흐름

```text
입력:   Renderer(password input) ──settings:update-provider──▶ Main
        → SecretCipher.encrypt → SQLite BLOB
        (Renderer는 저장 성공 후 입력 상태를 비운다)

사용:   SQLite BLOB → SecretCipher.decrypt (ActiveLLM.resolve 시점)
        → 어댑터 인스턴스 → HTTPS Authorization 헤더
        (평문은 해당 Job/테스트가 끝나면 참조가 사라진다)

반환:   Main ──▶ Renderer : hasApiKey: boolean 만
```

## 규칙

| 규칙 | 적용 위치 |
| --- | --- |
| 평문 Key를 DB·파일·로그에 쓰지 않는다 | Repository, 로거 |
| IPC 응답 타입에 Key 필드가 없다 | `ProviderSettingsView` (타입 수준에서 불가능하게) |
| 어댑터 오류 메시지 정제 | SDK 예외의 `message`를 그대로 전달하지 않고 `ProviderError(kind)`로 변환 |
| 보안 저장소 불가 시 저장 거부 | `ProviderSettingsService.update` |
| Linux `basic_text` 백엔드 | `safeStorage.getSelectedStorageBackend() === 'basic_text'`이면 사용 불가로 취급 (실제로 보호되지 않음) |

## 테스트 포인트

- `AIProviderSettings.configure`: 신규 Provider에 Key 없음 → 거절, 기존 Key 유지, 활성 전환, 카탈로그 밖 모델 거절.
- `ProviderSettingsService`: `cipher.isAvailable() = false`일 때 Key 저장 거절, 모델만 변경은 허용.
- `ActiveLLM`: 복호화 실패·카탈로그에서 빠진 모델 → `AI_PROVIDER_NOT_CONFIGURED`.
- 어댑터: HTTP 상태별 `ProviderError.kind` 매핑, 오류 메시지에 Key 미포함, web search 인용 → `sources` 추출.
- IPC: `settings:get-provider` 응답 직렬화 결과에 Key 문자열이 없음.
