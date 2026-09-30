import { NavLink } from 'react-router';
import { formatRelativeTime } from '../../../shared/lib/relative-time';
import { useNoteList } from '../api/note-queries';
import styles from './NoteList.module.css';

export function NoteList() {
  const { data: notes, isPending, isError, refetch } = useNoteList();

  return (
    <section className={styles.list} aria-label="노트 목록">
      {isPending && <div className={styles.skeleton} aria-hidden />}
      {isError && (
        <button type="button" className={styles.message} onClick={() => void refetch()}>
          목록을 불러오지 못했습니다 · 다시 시도
        </button>
      )}
      {notes?.length === 0 && <p className={styles.message}>아직 노트가 없습니다</p>}
      {notes?.map((note) => (
        <NavLink key={note.id} to={`/notes/${note.id}`} className={styles.item}>
          <span className={styles.title}>{note.title}</span>
          <span className={styles.meta}>
            <span className={styles.time}>{formatRelativeTime(note.updatedAt)}</span>
            {note.preview && <span className={styles.preview}>{note.preview}</span>}
          </span>
        </NavLink>
      ))}
    </section>
  );
}
