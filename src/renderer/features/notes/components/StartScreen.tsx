import { Plus } from 'lucide-react';
import { Navigate } from 'react-router';
import { useCreateNote, useNoteList } from '../api/note-queries';
import styles from './NotePage.module.css';

/** `#/`: 노트가 있으면 가장 최근 노트로, 없으면 빈 상태. */
export function StartScreen() {
  const { data: notes } = useNoteList();
  const createNote = useCreateNote();

  if (!notes) return null;
  const latest = notes.reduce<(typeof notes)[number] | undefined>(
    (best, note) => (!best || note.updatedAt > best.updatedAt ? note : best),
    undefined,
  );
  if (latest) return <Navigate to={`/notes/${latest.id}`} replace />;

  return (
    <section className={`paper ${styles.page}`}>
      <h1 className={styles.stateTitle}>첫 노트를 만들어 보세요</h1>
      <p className={styles.stateBody}>생각을 적고, 선택한 부분을 AI로 구체화·정리·시각화할 수 있습니다.</p>
      <div>
        <button type="button" className="button-primary" disabled={createNote.isPending} onClick={() => createNote.mutate(undefined)}>
          <Plus size={16} strokeWidth={1.75} />새 노트
        </button>
      </div>
    </section>
  );
}
