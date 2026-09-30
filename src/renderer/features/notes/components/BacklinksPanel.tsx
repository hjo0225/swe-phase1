import { Link2 } from 'lucide-react';
import { Link } from 'react-router';
import { useNoteLinks } from '../api/note-queries';
import styles from './NotePage.module.css';

/** 이 노트를 참조하는 노트들 (UC-NOTE-008). 없으면 표시하지 않는다. */
export function BacklinksPanel({ noteId }: { noteId: string }) {
  const { data } = useNoteLinks(noteId);
  if (!data || data.incoming.length === 0) return null;

  return (
    <section className={styles.backlinks} aria-label="이 노트를 참조하는 노트">
      <h2 className={styles.backlinksTitle}>
        <Link2 size={14} strokeWidth={1.75} aria-hidden />이 노트를 참조하는 노트
      </h2>
      <ul>
        {data.incoming.map((note) => (
          <li key={note.noteId}>
            <Link to={`/notes/${note.noteId}`}>{note.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
