import { useState } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { isPlaceholderTitle } from '../../../../shared/notes/default-names';
import { usePlaceNote } from '../../organize/api/organize-queries';
import { useRenameNote } from '../api/note-queries';
import styles from './NotePage.module.css';

const RENAME_ERRORS: Partial<Record<string, string>> = {
  NOTE_TITLE_TAKEN: 'A note with this name already exists in this folder',
  VAULT_BUSY: 'AI is organizing folders, so you can\'t rename right now',
  NOTE_TITLE_INVALID: 'This title can\'t be a file name (no \\ / : * ? " < > |, 200 characters max)',
};
/** Blink가 새 노트에 붙이는 임시 제목 (`Untitled`, `제목 없음 1` …) */

/** 제목 = 파일 이름 (D-16). 입력을 마칠 때(Enter·blur) 이름을 바꾸고, 실패하면 원래 이름으로 되돌린다. */
export function TitleInput({ noteId, title }: { noteId: string; title: string }) {
  const [draft, setDraft] = useState(title);
  const [committed, setCommitted] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const rename = useRenameNote();
  const place = usePlaceNote();

  const commit = () => {
    const next = draft.trim();
    if (next === committed) {
      setDraft(committed);
      return;
    }
    rename.mutate(
      { id: noteId, title: next },
      {
        onSuccess: (result) => {
          // 처음 제목을 붙인 순간 한 번만 자동 배치한다. 그 뒤 제목을 바꿔도 움직이지 않는다.
          if (isPlaceholderTitle(committed) && !isPlaceholderTitle(result.note.title)) place.mutate(noteId);
          setCommitted(result.note.title);
          setDraft(result.note.title);
          setError(null);
        },
        onError: (e) => {
          setDraft(committed);
          setError((e instanceof BlinkIpcError && RENAME_ERRORS[e.code]) || 'Couldn\'t rename');
        },
      },
    );
  };

  return (
    <div className={styles.titleField}>
      <input
        className={styles.title}
        aria-label="Note title"
        aria-invalid={error !== null}
        placeholder="Untitled"
        value={draft}
        disabled={rename.isPending}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') {
            setDraft(committed);
            setError(null);
            // blur 시 commit이 되돌린 값을 보도록 다음 틱에 blur 한다.
            const input = event.currentTarget;
            setTimeout(() => input.blur());
          }
        }}
      />
      {error && (
        <p role="alert" className={styles.titleError}>
          {error}
        </p>
      )}
    </div>
  );
}
