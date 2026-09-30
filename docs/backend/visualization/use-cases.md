# Visualization Domain — Use Cases

Spec 생성·검증은 assist의 UC-ASSIST-002(VISUALIZE) 안에서 일어난다. 이 도메인의 독립 유스케이스는 저장뿐이다.

---

## UC-VIS-001 인포그래픽 PNG 저장

- **Actor:** 사용자
- **Trigger:** 노트 안 인포그래픽 블록의 `PNG로 저장`
- **Preconditions:** Spec이 유효해서 SVG Preview가 렌더링되어 있다.
- **Main Flow:**
  1. (Renderer) SVG → Canvas(2x 배율) → PNG 바이트.
  2. (Renderer) `visualization:save-png { png, suggestedFileName }` 호출.
  3. PNG 시그니처와 크기(≤ 20 MB)를 확인한다.
  4. 파일명을 정제한다.
  5. 현재 창에 모달 Save Dialog를 띄운다 (기본 위치: 사용자의 다운로드 폴더, 필터: `*.png`).
  6. 선택한 경로에 파일을 쓴다.
  7. `{ saved: true, filePath }` 반환.
- **Alternative Flow:** 사용자가 Dialog를 취소 → `{ saved: false }` (오류 아님).
- **Failure Cases:** `EXPORT_INVALID_IMAGE`, `EXPORT_TOO_LARGE`, `EXPORT_WRITE_FAILED`
- **Postconditions:** 노트와 DB는 변하지 않는다.

## Application Flow

```text
visualization:save-png handler (Zod: png Uint8Array, suggestedFileName string ≤ 100)
→ ExportInfographicPng.execute({ png, suggestedFileName }, senderWindow)
   → PngImage.of(png)                          // 시그니처 89 50 4E 47, ≤ 20 MB
   → name = FileName.sanitize(suggestedFileName, 'infographic.png')
   → path = await fileSaver.askSavePath(senderWindow, name, [{ name: 'PNG', extensions: ['png'] }])
        null → { saved: false }
   → await fileSaver.write(path, png)          // 실패 → EXPORT_WRITE_FAILED
→ { saved: true, filePath: path }
```

`FileSaver` 포트 구현은 `dialog.showSaveDialog` + `fs.promises.writeFile`. 테스트에서는 Fake로 교체한다.

Main은 Renderer가 지정한 경로에 쓰지 않는다. **경로는 항상 사용자가 Main의 Dialog에서 고른다** — Renderer가 임의 경로 쓰기 권한을 얻지 못하게 하기 위함이다.
