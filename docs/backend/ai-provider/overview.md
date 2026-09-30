# AI Provider Domain — Overview

## 목적

사용자 소유의 LLM 연결(Provider, API Key, Model)을 관리하고, 다른 도메인이 **어떤 Provider인지 몰라도** LLM을 사용할 수 있게 한다. 명세서 §26~§29를 담당한다.

## 소유

- Provider별 설정(모델, Base URL, 암호화된 API Key)과 **활성 Provider**
- 모델 카탈로그와 모델별 Capability
- API Key 암호화 보관 (`safeStorage`)
- 연결 테스트
- Provider 어댑터 (`OpenAIProvider`, `KimiProvider`)와 `LLMProvider` 포트
- 다른 도메인에 공개하는 `ActiveLLM` (활성 모델 + Capability + 클라이언트)

## 소유하지 않음

- 어떤 작업에 어떤 Capability가 필요한지 → assist (`JobType`)
- 프롬프트, 결과 검증 → assist
- Capability에 따른 버튼 잠금 UI → Renderer (`settings:get-provider` 결과 사용)

## 핵심 설계 결정

1. **설정은 Provider별로 보관**하고 하나만 활성이다. OpenAI와 Kimi를 오가도 각자의 Key가 남는다. 설정 화면에서 **저장한 Provider가 활성 Provider가 된다**(명세서 §26 화면: 드롭다운에서 고른 Provider가 사용 중인 Provider).
2. **Capability는 모델 카탈로그가 결정**한다. 명세서 §28의 `getCapabilities()`를 Provider 인스턴스가 아니라 (Provider, Model) 카탈로그로 옮겼다 — Capability는 모델마다 다르다.
3. Phase 1은 **카탈로그에 있는 모델만** 선택할 수 있다. 임의 모델 ID는 Capability를 알 수 없어 허용하지 않는다.
4. `safeStorage`를 사용할 수 없으면 Key를 저장하지 않는다 (D-08).
5. API Key는 Renderer → Main 방향으로 **입력 시 한 번만** 이동한다. Main → Renderer로는 절대 보내지 않는다(`hasApiKey: boolean`만 제공).
