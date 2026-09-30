# Note Domain — Application Flows

## 구성

```text
VaultManager            보관함 열기·전환·최근 목록, 현재 VaultSession 보관
 └─ VaultSession        열린 보관함 하나: VaultFileSystem + NoteIndex(색인 DB) + 감시
     ├─ NoteService     노트 유스케이스
     ├─ FolderService   폴더 유스케이스
     └─ IndexSync       색인 맞추기 (열 때 전체, 감시 이벤트 때 부분)
```

IPC 핸들러는 `VaultManager.current()`로 세션을 얻는다. 없으면 `VAULT_NOT_OPEN`. assist의 `NoteQueries.exists`, AI Job Repository도 현재 세션의 색인 DB를 쓴다.

## 보관함 열기

```text
vault:open {root}
→ VaultManager.open(root)
   → 폴더 확인 (없음: VAULT_NOT_FOUND, 권한 없음: VAULT_NOT_ACCESSIBLE)
   → 이전 세션 close (감시 중지, DB close)
   → 색인 DB open(userData/vaults/<hash>.db) + vaultMigrations
   → IndexSync.full()
   → RecoverInterruptedJobs
   → watch 시작 → 변경 시 IndexSync.paths(...) → publish vault:changed
   → AppConfig.recent 갱신
```

## 본문 저장

```text
note:update {id, content}
→ entry = index.findById(id) ?? NOTE_NOT_FOUND
→ content = NoteContent.fromMarkdown(md)
→ 파일 내용과 같으면 {changed:false}
→ fs.writeAtomic(path, md)            -- 실패: NOTE_WRITE_FAILED
→ index.upsert({…, plainText, linkTargets, size, mtimeMs: stat 후})   -- 감시 이벤트가 와도 무시되도록 먼저
```

## 이름 변경

```text
note:rename {id, title}
→ name = NoteName.of(title); newPath = path.withName(name)
→ 같으면 끝, 대상 경로가 있으면 NOTE_TITLE_TAKEN
→ 옛 대상 표현들 = {옛 이름, 옛 경로}  (이 노트로 해석되던 것만)
→ fs.rename → index.movePath(id, newPath)
→ 링크 고치기: 후보 = index.sourcesLinkingTo(옛 키들)
     각 후보 파일에서 resolveLinkTarget(대상, 옛 노트 목록) === id 인 대상만
     rewriteLinkTargets(md, {옛 대상 → linkTargetFor(newPath, 새 경로들)}) → writeAtomic → index.upsert
→ { note, updatedNoteIds }   (Renderer는 열린 노트가 목록에 있으면 다시 불러온다)
```

폴더 이름 변경·노트 이동도 같은 방식이다(경로로 적힌 대상만 바뀐다 — 이름으로 적힌 링크는 여전히 맞다).

## 외부 변경

```text
watch 이벤트 (fs.watch recursive) → 300ms 모음
→ IndexSync.paths(changed): 파일이 있으면 stat 비교 후 다시 읽기, 없으면 index.remove
   폴더 이벤트면 해당 폴더를 훑는다
→ 실제로 바뀐 노트가 있으면 publish vault:changed {noteIds, structure}
```
