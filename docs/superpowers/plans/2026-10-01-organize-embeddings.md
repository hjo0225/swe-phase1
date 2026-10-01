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

---

# 변경 2: 잘게 묶고, 위로 합치기는 gpt가 (2026-10-01)

**왜:** 상한 √(n÷2)로는 폴더 수가 모자라 k-means가 Rust를 헬스·러닝과 묶었다 (k-means는 «전체가 덜 흩어지는 곳»으로 붙인다: Spring에 붙이면 15.87, 러닝에 붙이면 15.14). 군집화 나무에서 gpt에게 «살릴 층»만 고르게 하면 나무의 잘못(운동+코딩 갈림길)을 그대로 살렸다. 작은 묶음 9개를 gpt에게 주고 경로를 자유롭게 정하게 했더니 `공부/{rust, spring, 자료구조, 파이썬}`, `생활/{기록, 일정}`, `요리/{레시피, 베이킹}`, `운동`이 나왔다 ($0.0015, 2.4초).

## Global Constraints (바뀌는 것만)
- k 범위: 2 ~ max(2, ⌊n ÷ 2⌋) (√ 상한 되돌림). `MIN_SILHOUETTE = 0.05` 유지 (상한 n÷2로 재측정: 관계없는 제목 0.029~0.032, 노트 100개 0.158).
- 작은 묶음마다 gpt가 폴더 경로(1~3층, 지금 폴더 기준)를 정한다. 같은 경로 = 같은 폴더. AI 호출은 분류하기 한 번에 한 번.
- 검사: 모든 묶음 정확히 한 번, 깊이 1~3, 이름은 `FolderName` 규칙 + «미분류» 금지. 틀리면 `ORGANIZE_NAMING_FAILED` («폴더를 정리하지 못했습니다»).
- `OrganizePlan.newFolders`의 `name: string` → `path: string[]` (지금 폴더 기준 상대 경로).

## Tasks
### F1: 상한 되돌리기
- `clustering.ts` — 상한 ⌊n÷2⌋. Test: «tries up to half the notes: 8 titles in 4 pairs become 4 groups»

### F2: gpt가 폴더 경로를 정함
- `folder-namer.ts` → `folder-planner.ts`: `folderPlanRequest()`, `planFolders(llm, { parentPath, groups }, signal): Promise<string[][]>`
- Tests: 경로·층 예시가 질문에 들어감, 묶음 순서대로 경로 반환, 빠짐·중복·모르는 묶음·4층·금지 문자·«미분류»·빈 경로 거절, AI 실패 → `ORGANIZE_NAMING_FAILED`
- 가짜 AI(`BLINK_FAKE_LLM`): `folder_paths` 스키마면 묶음마다 `["묶음N"]`

### F3: 서비스·계약·화면
- `organize.ts` 타입, `schemas.ts`(path 배열 1~3), `organize-service.ts`(경로대로 폴더 만들기), 미리보기 표시 `새 폴더 공부 / spring`, Mock 적용
- Tests: «creates nested folders from the planned paths and merges groups with the same path»
