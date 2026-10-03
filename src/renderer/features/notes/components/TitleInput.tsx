import { useState } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { usePlaceNote } from '../../organize/api/organize-queries';
import { useRenameNote } from '../api/note-queries';
import styles from './NotePage.module.css';

const RENAME_ERRORS: Partial<Record<string, string>> = {
  NOTE_TITLE_TAKEN: '같은 폴더에 같은 이름의 노트가 있습니다',
  VAULT_BUSY: 'AI가 폴더를 정리하는 중이라 지금은 이름을 바꿀 수 없습니다',
  NOTE_TITLE_INVALID: '파일 이름으로 쓸 수 없는 제목입니다 (\\ / : * ? " < > | 제외, 200자 이하)',
};
/** Blink가 새 노트에 붙이는 임시 제목 (`제목 없음`, `제목 없음 1` …) */
const PLACEHOLDER_TITLE = /^제목 없음( \d+)?$/;

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
          if (PLACEHOLDER_TITLE.test(committed) && !PLACEHOLDER_TITLE.test(result.note.title)) place.mutate(noteId);
          setCommitted(result.note.title);
          setDraft(result.note.title);
          setError(null);
        },
        onError: (e) => {
          setDraft(committed);
          setError((e instanceof BlinkIpcError && RENAME_ERRORS[e.code]) || '이름을 바꾸지 못했습니다');
        },
      },
    );
  };

  return (
    <div className={styles.titleField}>
      <input
        className={styles.title}
        aria-label="노트 제목"
        aria-invalid={error !== null}
        placeholder="제목 없음"
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
