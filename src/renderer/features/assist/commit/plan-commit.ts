import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { AIJobView } from '../../../../shared/ipc/assist';
import { AI_COMMIT_META, findPendingRanges, removePending } from '../editor/ai-pending';

type Range = { from: number; to: number };

export type CommitPlan =
  /** 이 문서에 해당 Mark가 없다 (다른 노트의 Job이거나 이미 처리됨) */
  | { kind: 'none' }
  /** 아직 처리 중 → 잠금·Pulse 유지 */
  | { kind: 'wait' }
  /** 실패 → 잠금 해제, 실패 칩 표시, Mark는 재시도를 위해 유지 */
  | { kind: 'markFailed'; jobId: string }
  /** 적용하지 않고 Mark만 제거 (원문 유지) */
  | { kind: 'discard'; jobId: string; range: Range; reason: 'changed' | 'missing' }
  | { kind: 'replace'; jobId: string; range: Range; markdown: string }
  | { kind: 'insertBelow'; jobId: string; range: Range; spec: unknown };

/**
 * Commit 규칙 (docs/frontend/data-flow.md 흐름 2). React·IPC 없이 문서와 Job만 보고 결정한다.
 * @param requesting 아직 ai:create-job 응답을 기다리는 jobId — 목록에 없다고 지우면 안 된다.
 */
export function planCommit(
  doc: PMNode,
  jobId: string,
  job: AIJobView | undefined,
  requesting: ReadonlySet<string>,
): CommitPlan {
  const pending = findPendingRanges(doc).get(jobId);
  if (!pending) return { kind: 'none' };
  const range = { from: pending.from, to: pending.to };

  if (!job) return requesting.has(jobId) ? { kind: 'wait' } : { kind: 'discard', jobId, range, reason: 'missing' };
  if (job.status === 'QUEUED' || job.status === 'RUNNING') return { kind: 'wait' };
  if (job.status === 'FAILED') return { kind: 'markFailed', jobId };

  // BR-ASSIST-08: 원문이 스냅샷과 다르면 적용하지 않는다 (Atomic 보장의 마지막 방어선).
  if (pending.text !== job.inputText) return { kind: 'discard', jobId, range, reason: 'changed' };
  const result = job.result;
  if (!result) return { kind: 'discard', jobId, range, reason: 'missing' };
  if (result.kind === 'INFOGRAPHIC') return { kind: 'insertBelow', jobId, range, spec: result.spec };
  return { kind: 'replace', jobId, range, markdown: result.markdown };
}

/** 계획을 하나의 편집기 트랜잭션으로 적용한다. 자동 저장이 이어서 본문을 저장한다. */
export function applyCommit(editor: Editor, plan: CommitPlan): void {
  switch (plan.kind) {
    case 'replace':
      // 새 내용에는 aiPending Mark가 없으므로 교체와 함께 잠금이 풀린다.
      // updateSelection: false — 결과가 도착해도 사용자가 다른 곳에서 쓰던 커서를 옮기지 않는다.
      editor
        .chain()
        .setMeta(AI_COMMIT_META, true)
        .insertContentAt(plan.range, plan.markdown, { contentType: 'markdown', updateSelection: false })
        .run();
      return;
    case 'discard':
      removePending(editor, plan.jobId);
      return;
    case 'insertBelow':
      insertInfographicBelow(editor, plan);
      return;
    default:
      return;
  }
}

/** 원문은 유지하고, 범위가 끝나는 블록 바로 아래에 인포그래픽 블록을 넣는다 (Q-01). */
function insertInfographicBelow(editor: Editor, plan: Extract<CommitPlan, { kind: 'insertBelow' }>): void {
  const markType = editor.schema.marks.aiPending!;
  const blockEnd = editor.state.doc.resolve(plan.range.to).after(1);
  editor
    .chain()
    .setMeta(AI_COMMIT_META, true)
    .command(({ tr }) => {
      tr.removeMark(plan.range.from, plan.range.to, markType);
      return true;
    })
    .insertContentAt(blockEnd, { type: 'infographic', attrs: { spec: plan.spec } }, { updateSelection: false })
    .run();
}
