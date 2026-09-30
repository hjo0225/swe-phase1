import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { NameDialog } from '../../../shared/ui/NameDialog';
import { useCreateFolder, useDeleteFolder, useRenameFolder } from '../api/note-queries';

const FOLDER_ERRORS: Partial<Record<string, string>> = {
  FOLDER_NAME_TAKEN: '같은 이름의 폴더가 이미 있습니다',
  FOLDER_NAME_INVALID: '폴더 이름으로 쓸 수 없습니다 (\\ / : * ? " < > | 제외, 점으로 시작 불가)',
  FOLDER_NOT_FOUND: '폴더를 찾을 수 없습니다',
};

const messageOf = (error: unknown) =>
  error ? (error instanceof BlinkIpcError && FOLDER_ERRORS[error.code]) || '폴더 작업에 실패했습니다' : null;

const nameOf = (path: string) => path.split('/').pop() ?? path;

export type FolderDialogState =
  | { kind: 'create'; parent: string }
  | { kind: 'rename'; path: string }
  | { kind: 'delete'; path: string; noteCount: number };

/** 폴더 만들기·이름 바꾸기·삭제 Dialog (UC-FOLDER-001~003). */
export function FolderDialog({ state, onClose }: { state: FolderDialogState; onClose(): void }) {
  const create = useCreateFolder();
  const rename = useRenameFolder();
  const remove = useDeleteFolder();

  if (state.kind === 'create') {
    return (
      <NameDialog
        title={state.parent ? `'${nameOf(state.parent)}' 안에 새 폴더` : '새 폴더'}
        label="폴더 이름"
        confirmLabel="만들기"
        busy={create.isPending}
        error={messageOf(create.error)}
        onClose={onClose}
        onSubmit={(name) => create.mutate({ parent: state.parent || undefined, name }, { onSuccess: onClose })}
      />
    );
  }
  if (state.kind === 'rename') {
    return (
      <NameDialog
        title="폴더 이름 바꾸기"
        label="폴더 이름"
        initialValue={nameOf(state.path)}
        confirmLabel="바꾸기"
        busy={rename.isPending}
        error={messageOf(rename.error)}
        onClose={onClose}
        onSubmit={(name) => rename.mutate({ path: state.path, name }, { onSuccess: onClose })}
      />
    );
  }
  return (
    <Dialog
      title={`'${nameOf(state.path)}' 폴더를 삭제할까요?`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" data-autofocus onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(state.path, { onSuccess: onClose })}
          >
            삭제
          </button>
        </>
      }
    >
      {state.noteCount > 0
        ? `안에 있는 노트 ${state.noteCount}개와 하위 폴더도 함께 삭제되며 되돌릴 수 없습니다.`
        : '빈 폴더를 삭제합니다.'}
      {remove.error ? <p role="alert">{messageOf(remove.error)}</p> : null}
    </Dialog>
  );
}
