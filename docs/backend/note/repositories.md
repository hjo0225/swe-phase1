# Note Domain — Ports & Repository Contracts

## VaultFileSystem (파일 원본)

```ts
interface VaultFileSystem {
  readonly root: string;
  listMarkdownFiles(): { path: string; size: number; mtimeMs: number; birthtimeMs: number }[]; // 숨김 폴더 제외
  listFolders(): string[];                       // 보관함 기준 경로
  read(path: string): string;
  stat(path: string): { size: number; mtimeMs: number; birthtimeMs: number } | null;
  /** 같은 폴더의 임시 파일에 쓴 뒤 바꿔 끼운다 — 중간에 끊겨도 원본이 깨지지 않는다 */
  writeAtomic(path: string, text: string): void;
  createExclusive(path: string, text: string): void;   // 이미 있으면 실패
  rename(from: string, to: string): void;              // 파일·폴더 공통
  remove(path: string): void;                          // 파일
  makeFolder(path: string): void;
  removeFolder(path: string): void;                    // 안의 내용까지
  exists(path: string): boolean;
  watch(onChange: (paths: string[]) => void): () => void;
}
```

동기 API(`fs.*Sync`)를 쓴다. 노트 파일은 작고 Main의 다른 처리(SQLite)도 동기라 흐름이 단순해진다.

## NoteIndex (색인 Repository)

```ts
interface NoteIndexEntry { id: string; path: string; plainText: string; linkTargets: string[]; size: number; mtimeMs: number; createdAt: Date; updatedAt: Date }

interface NoteIndex {
  findById(id: string): NoteIndexEntry | null;
  findByPath(path: string): NoteIndexEntry | null;
  all(): NoteIndexEntry[];
  upsert(entry: NoteIndexEntry): void;         // 경로 기준, 링크 대상 교체 포함 — 단일 트랜잭션
  remove(id: string): void;                    // 링크·AI Job cascade
  movePath(id: string, path: string): void;    // ID 유지
  search(query: SearchQuery, opts: { excludeNoteId?: string; limit: number }): NoteSearchRow[];
  linkTargetsOf(id: string): string[];
  sourcesLinkingTo(keys: string[]): string[];  // 대상 키(소문자)로 역참조 후보 찾기
}
```

- 백링크: `sourcesLinkingTo([이름, 경로])`로 후보를 좁힌 뒤 공유 규칙(`resolveLinkTarget`)으로 실제로 이 노트로 해석되는 것만 남긴다.
- 범용 CRUD는 두지 않는다.

## AppConfigStore

```ts
interface AppConfigStore {
  load(): { lastVault: string | null; recentVaults: { root: string; openedAt: string }[] };
  save(config): void;   // userData/app-config.json
}
```
