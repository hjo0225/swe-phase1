# 노트 자동 분류 시험 데이터

| 파일 | 내용 |
|---|---|
| `organize-test-vault/` | 합성 노트 100개. 폴더 없이 맨 위에 있다 — Blink에서 이 폴더를 보관함으로 열고 «보관함 분류하기»를 누르면 된다 |
| `organize-test-answer.csv` | 노트마다 원래 주제(큰 주제, 작은 주제). 분류 결과가 맞는지 비교할 때 쓴다 |
| `make-organize-test-vault.cjs` | 위 두 개를 다시 만드는 스크립트: `node samples/make-organize-test-vault.cjs` |

주제 구성: 코딩(Spring 15, Rust 10, 파이썬 10, 자료구조 8), 요리(찌개 8, 파스타 6, 베이킹 5), 운동(헬스 7, 러닝 5), 여행(제주 5, 일본 5), 기타 16.

시험하면 노트가 폴더로 옮겨진다. 처음 상태로 되돌리려면 `organize-test-vault/`를 통째로 지우고 스크립트를 다시 실행한다.
