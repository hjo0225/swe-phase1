# 노트 자동 분류 — 제목 «뜻» 비교로 바꾸기 (변경 계획)

**앞선 계획:** `2026-10-01-organize-notes.md` (구현 완료). 이 문서는 그 위에 얹는 변경이다.
**Spec:** `2026-10-01-organize-notes-spec.md` (2026-10-01 개정판: 임베딩·k 상한·기준값 0.05)

**Goal:** 제목 비교를 글자 조각(TF-IDF)에서 OpenAI 임베딩으로 바꾸고, 한 번에 나누는 묶음 수를 √(노트 수 ÷ 2)로 제한해 «위는 넓게, 들어갈수록 세세하게» 나뉘게 한다.

**왜:** 합성 노트 100개(11주제 + 잡동사니 16개)로 측정한 결과
- 글자 조각: 가장 좋은 점수 0.094로 기준 0.1에 막힘. 통과시켜도 맨 위에 작은 폴더 20여 개 (Spring·Rust가 둘 다 코딩이라는 걸 모름).
- `text-embedding-3-small` + 넓게 5개: 큰 주제 정답률 62%.
- `text-embedding-3-large` + 넓게 5개: 88%. 상한 √(100÷2)=7로 1층 → 2층을 나누면 운동→헬스/러닝, 요리→파스타/베이킹처럼 층이 생김.
- 기준값: 관계없는 제목만 0.023~0.032, 주제 있는 노트 0.107~0.603 → 0.05.

## Global Constraints
- 앞 계획의 Global Constraints는 그대로. 아래만 바뀐다.
- 비교: 제목 → `text-embedding-3-large` 임베딩 → 코사인 유사도 표. k-means·실루엣·반경은 유사도 표만 받으므로 그대로 쓴다.
- k 범위: 2 ~ max(2, ⌊√(n ÷ 2)⌋). `MIN_SILHOUETTE = 0.05`.
- 임베딩은 «사용 중» AI의 `LLMProvider.embed`로 부른다. OpenAI만 구현하고 Kimi는 `ProviderError('UNSUPPORTED')`.
- AI가 필요 없는 경우에는 부르지 않는다: 나눌 대상이 3개 미만이고 하위 폴더가 없을 때(분류하기), 하위 폴더가 없을 때(자동 배치).
- 오류 코드: 공급자가 임베딩을 못 하면 `AI_CAPABILITY_UNSUPPORTED`, 그 밖의 임베딩 실패는 새 코드 `ORGANIZE_EMBEDDING_FAILED`.
- 테스트는 가짜 임베딩만 쓴다 (실제 API 호출 없음).

## Tasks
### E1: AI 연결에 임베딩 추가
- Modify: `src/main/ai-provider/application/ports.ts` — `embed(request: { inputs: string[]; signal: AbortSignal }): Promise<number[][]>`
- Modify: `openai-provider.ts` — `EMBEDDING_MODEL = 'text-embedding-3-large'`, `client.embeddings.create`, 결과를 `index` 순서로 정렬
- Modify: `kimi-provider.ts` — `UNSUPPORTED`
- Modify: `fake-llm-provider.ts` — 단어 해시로 만든 가짜 임베딩 (개발용 `BLINK_FAKE_LLM=1`)
- Modify: `testing.ts` — `fakeProvider` 기본 `embed`
- Tests: `openai-provider.test.ts` «embeds titles with the large embedding model in input order», `kimi-provider.test.ts` «does not support embeddings»

### E2: 계산을 임베딩용으로
- Modify: `similarity.ts` — `titleSimilarity`(글자 조각) 삭제, `cosineSimilarity(vectors)` 추가
- Modify: `clustering.ts` — 상한 √(n÷2), 기준 0.05
- Tests: `similarity.test.ts`, `clustering.test.ts`, `placement.test.ts`를 벡터 픽스처로 바꿈. «caps the number of groups at √(n/2)» 추가

### E3: 분류 서비스가 임베딩을 쓰게
- Modify: `organize-service.ts` — `embedTitles()`, `place`·`importFile`이 async, 필요할 때만 AI 호출, 오류 매핑
- Modify: `result.ts` — `ORGANIZE_EMBEDDING_FAILED`
- Tests: `organize-service.test.ts`의 가짜 AI에 주제 단어 기반 가짜 임베딩. «needs a configured OpenAI to classify», «needs a configured OpenAI to place a note into subfolders», «reports a provider that cannot embed»

### E4: 화면 문구
- Modify: `OrganizeDialog.tsx`, `NoteTree.tsx` — `AI_PROVIDER_NOT_CONFIGURED`·`AI_CAPABILITY_UNSUPPORTED`·`ORGANIZE_EMBEDDING_FAILED` 문구
- Tests: `organize.flow.test.tsx` «tells the user to connect OpenAI when importing without it»
