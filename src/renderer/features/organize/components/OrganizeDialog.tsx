import { useEffect, useRef } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { useOrganizeApply, useOrganizePreview } from '../api/organize-queries';

const ERRORS: Partial<Record<string, string>> = {
  AI_PROVIDER_NOT_CONFIGURED: '설정에서 OpenAI를 연결해 주세요',
  AI_CAPABILITY_UNSUPPORTED: '지금 AI 설정으로는 분류할 수 없습니다. 설정에서 OpenAI를 연결해 주세요',
  ORGANIZE_EMBEDDING_FAILED: '노트 제목을 읽지 못했습니다. 다시 시도해 주세요',
  ORGANIZE_NAMING_FAILED: '폴더 이름을 짓지 못했습니다. 다시 시도해 주세요',
};
const SKIPPED = {
  TOO_FEW_NOTES: '분류하려면 노트가 3개 이상 있어야 합니다',
  NO_CLEAR_GROUPS: '나눌 만한 묶음이 없습니다',
} as const;

/** 분류하기: 열리자마자 미리보기를 만들고, «옮기기»를 누르면 그대로 옮긴다. */
export function OrganizeDialog({ folder, onClose }: { folder: string; onClose(): void }) {
  const preview = useOrganizePreview();
  const apply = useOrganizeApply();
  const started = useRef(false);
  const { mutate } = preview;

  useEffect(() => {
    // StrictMode에서 effect가 두 번 돌아도 AI를 두 번 부르지 않는다.
    if (started.current) return;
    started.current = true;
    mutate(folder);
  }, [mutate, folder]);

  const plan = preview.data;
  const empty = plan !== undefined && plan.newFolders.length === 0 && plan.moves.length === 0;
  const error = preview.error ?? apply.error;
  const errorText = error ? (error instanceof BlinkIpcError && ERRORS[error.code]) || '분류하지 못했습니다' : null;
  const failed = apply.data?.failed ?? [];

  return (
    <Dialog
      title={`분류하기 — ${folder || '보관함 맨 위'}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!plan || empty || apply.isPending || apply.isSuccess}
            // 옮기지 못한 노트가 있으면 닫지 않고 알려 준다
            onClick={() => plan && apply.mutate(plan, { onSuccess: (result) => result.failed.length === 0 && onClose() })}
          >
            옮기기
          </button>
        </>
      }
    >
      {preview.isPending && <p>분류하는 중…</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {failed.length > 0 && (
        <p role="alert">{`노트 ${failed.length}개는 옮기지 못했습니다: ${failed.map((n) => n.title).join(', ')}`}</p>
      )}
      {plan && empty && <p>{SKIPPED[plan.skipped ?? 'NO_CLEAR_GROUPS']}</p>}
      {plan && !empty && (
        <ul aria-label="분류 미리보기">
          {plan.newFolders.map((group) => (
            <li key={`new:${group.name}`}>
              <strong>새 폴더 {group.name}</strong>
              <ul>
                {group.notes.map((note) => (
                  <li key={note.id}>{note.title}</li>
                ))}
              </ul>
            </li>
          ))}
          {plan.moves.map((move) => (
            <li key={`move:${move.id}`}>
              {move.title} → {move.to}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
