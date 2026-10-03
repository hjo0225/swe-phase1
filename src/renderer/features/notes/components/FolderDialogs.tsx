import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { NameDialog } from '../../../shared/ui/NameDialog';
import { useCreateFolder, useDeleteFolder, useRenameFolder } from '../api/note-queries';

const FOLDER_ERRORS: Partial<Record<string, string>> = {
  FOLDER_NAME_TAKEN: 'A folder with that name already exists',
  FOLDER_NAME_INVALID: 'Not a valid folder name (no \\ / : * ? " < > |, and it can\'t start with a dot)',
  FOLDER_NOT_FOUND: 'Folder not found',
};

const messageOf = (error: unknown) =>
  error ? (error instanceof BlinkIpcError && FOLDER_ERRORS[error.code]) || 'The folder action failed' : null;

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
        title={state.parent ? `New folder in '${nameOf(state.parent)}'` : 'New folder'}
        label="Folder name"
        confirmLabel="Create"
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
        title="Rename folder"
        label="Folder name"
        initialValue={nameOf(state.path)}
        confirmLabel="Rename"
        busy={rename.isPending}
        error={messageOf(rename.error)}
        onClose={onClose}
        onSubmit={(name) => rename.mutate({ path: state.path, name }, { onSuccess: onClose })}
      />
    );
  }
  return (
    <Dialog
      title={`Delete the '${nameOf(state.path)}' folder?`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" data-autofocus onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(state.path, { onSuccess: onClose })}
          >
            Delete
          </button>
        </>
      }
    >
      {state.noteCount > 0
        ? `${state.noteCount} ${state.noteCount === 1 ? 'note' : 'notes'} and any subfolders inside are deleted too. This can't be undone.`
        : 'This deletes an empty folder.'}
      {remove.error ? <p role="alert">{messageOf(remove.error)}</p> : null}
    </Dialog>
  );
}
