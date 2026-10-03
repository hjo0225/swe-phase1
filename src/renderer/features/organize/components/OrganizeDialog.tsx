import { useEffect, useRef } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { useOrganizeApply, useOrganizePreview } from '../api/organize-queries';

const ERRORS: Partial<Record<string, string>> = {
  AI_PROVIDER_NOT_CONFIGURED: 'Connect OpenAI in Settings',
  AI_CAPABILITY_UNSUPPORTED: 'Your current AI setup can\'t organize. Connect OpenAI in Settings',
  ORGANIZE_EMBEDDING_FAILED: 'Couldn\'t read the note titles. Please try again',
  ORGANIZE_NAMING_FAILED: 'Couldn\'t organize the folders. Please try again',
};
const SKIPPED = {
  TOO_FEW_NOTES: 'You need at least 3 notes to organize',
  NO_CLEAR_GROUPS: 'No clear groups to split into',
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
  const errorText = error ? (error instanceof BlinkIpcError && ERRORS[error.code]) || 'Couldn\'t organize' : null;
  const failed = apply.data?.failed ?? [];

  return (
    <Dialog
      title={`Organize — ${folder || 'Top of vault'}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!plan || empty || apply.isPending || apply.isSuccess}
            // 옮기지 못한 노트가 있으면 닫지 않고 알려 준다
            onClick={() => plan && apply.mutate(plan, { onSuccess: (result) => result.failed.length === 0 && onClose() })}
          >
            Move
          </button>
        </>
      }
    >
      {preview.isPending && <p>Organizing…</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {failed.length > 0 && (
        <p role="alert">{`${failed.length} ${failed.length === 1 ? 'note' : 'notes'} couldn't be moved: ${failed.map((n) => n.title).join(', ')}`}</p>
      )}
      {plan && empty && <p>{SKIPPED[plan.skipped ?? 'NO_CLEAR_GROUPS']}</p>}
      {plan && !empty && (
        <ul aria-label="Organize preview">
          {plan.newFolders.map((group) => (
            <li key={`new:${group.path.join('/')}`}>
              <strong>{`New folder ${group.path.join(' / ')}`}</strong>
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
