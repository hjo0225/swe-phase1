# Visualization Domain — API Contract (IPC)

## 채널

| 채널 | Preload | 요청 | 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `visualization:save-png` | `visualization.savePng` | `{ png: Uint8Array; suggestedFileName?: string }` | `{ saved: true; filePath: string } \| { saved: false }` | `EXPORT_INVALID_IMAGE`, `EXPORT_TOO_LARGE`, `EXPORT_WRITE_FAILED` |

## 오류 코드

| code | 의미 |
| --- | --- |
| `EXPORT_INVALID_IMAGE` | PNG 시그니처가 아님 |
| `EXPORT_TOO_LARGE` | 20 MB 초과 |
| `EXPORT_WRITE_FAILED` | 파일 쓰기 실패(권한, 디스크 공간 등) |

## 공유 타입

`InfographicSpec`은 IPC 채널이 아니라 `AIJobView.result`(assist)와 노트 본문 `infographic` 노드로 전달된다. 타입과 검증 함수는 `src/shared/visualization/`에서 import한다.

## 명세서 대비 변경

| 명세서 | 설계 |
| --- | --- |
| `Visualization` 테이블(`specJson`, `svg`) | 없음 — Spec은 본문 노드, SVG는 매번 렌더링 (D-05) |
| `visualization:save-png` | 유지. Renderer가 PNG 바이트를 만들고 Main은 Dialog + 쓰기만 |
