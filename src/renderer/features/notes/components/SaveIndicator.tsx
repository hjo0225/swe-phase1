import { getAutosave, useSaveStatus } from '../autosave/autosave';
import styles from './NotePage.module.css';

const LABEL = {
  idle: '',
  dirty: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
} as const;

export function SaveIndicator({ noteId }: { noteId: string }) {
  const status = useSaveStatus(noteId);
  return (
    <span className={styles.saveStatus} data-status={status} role="status">
      <span className={styles.saveDot} aria-hidden />
      {LABEL[status]}
      {status === 'error' && (
        <button type="button" className={styles.retry} onClick={() => void getAutosave().get(noteId).flush()}>
          Try again
        </button>
      )}
    </span>
  );
}
