import { getAutosave, useSaveStatus } from '../autosave/autosave';
import styles from './NotePage.module.css';

const LABEL = {
  idle: '',
  dirty: '저장 중…',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패',
} as const;

export function SaveIndicator({ noteId }: { noteId: string }) {
  const status = useSaveStatus(noteId);
  return (
    <span className={styles.saveStatus} data-status={status} role="status">
      <span className={styles.saveDot} aria-hidden />
      {LABEL[status]}
      {status === 'error' && (
        <button type="button" className={styles.retry} onClick={() => void getAutosave().get(noteId).flush()}>
          다시 시도
        </button>
      )}
    </span>
  );
}
