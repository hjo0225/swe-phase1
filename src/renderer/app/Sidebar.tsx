import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import { useCreateNote } from '../features/notes/api/note-queries';
import { NoteList } from '../features/notes/components/NoteList';
import { getBlink } from '../shared/api/blink';
import styles from './Sidebar.module.css';

const modifierKey = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

export function Sidebar() {
  const { data: appInfo } = useQuery({
    queryKey: ['app', 'info'],
    queryFn: () => getBlink().app.getInfo(),
    staleTime: Infinity,
  });
  const createNote = useCreateNote();

  return (
    <nav aria-label="Blink" className={`glass ${styles.sidebar}`}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden />
        Blink
      </div>

      <button type="button" className="button-primary" disabled={createNote.isPending} onClick={() => createNote.mutate()}>
        <Plus size={16} strokeWidth={1.75} />새 노트
      </button>

      <NoteList />

      <div className={styles.footer}>
        {/* 검색은 Stage 3에서 연결한다. */}
        <button type="button" className={styles.navItem} disabled>
          <Search size={16} strokeWidth={1.75} />
          검색
          <kbd className={styles.kbd}>{modifierKey} K</kbd>
        </button>
        <div className={`floating-chip ${styles.aiStatus}`}>
          <span className={styles.statusDot} aria-hidden />
          AI 설정 필요
        </div>
        <NavLink to="/settings/ai" className={styles.navItem}>
          <Settings size={16} strokeWidth={1.75} />
          설정
        </NavLink>
        <span className={styles.version}>{appInfo ? `v${appInfo.version}` : ''}</span>
      </div>
    </nav>
  );
}
