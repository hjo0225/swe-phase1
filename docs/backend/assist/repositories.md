# Assist Domain — Repository Contract

```ts
interface AIJobRepository {
  findById(id: JobId): AIJob | null;
  findByNoteId(noteId: NoteId): AIJob[];          // createdAt DESC
  findUnfinished(): AIJob[];                      // status IN (QUEUED, RUNNING)
  save(job: AIJob): void;                         // UPSERT
  deleteFinishedBefore(cutoff: Date): number;     // COMPLETED/FAILED && completedAt < cutoff
}
```

## 설계 메모

- `delete(job)`가 없다. Job은 사용자가 지우지 않는다. 노트 삭제 시 FK cascade, 보관 기간 경과 시 `deleteFinishedBefore`로만 사라진다.
- `save()`는 노트 존재를 검사하지 않는다. FK 위반(노트가 이미 삭제됨)은 infrastructure가 `JobOwnerGoneError`로 변환하고 Runner가 결과 폐기로 처리한다 — 재조회 직후 삭제되는 극히 짧은 경합 대비.
- 다른 도메인 테이블(`notes`)을 조회하지 않는다. 노트 존재 확인은 `NoteQueries`를 쓴다.
