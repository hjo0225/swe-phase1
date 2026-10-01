import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Plus, Search, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { AIStatusChip } from '../features/ai-settings/components/AIStatusChip';
import { useCreateNote } from '../features/notes/api/note-queries';
import { FolderDialog } from '../features/notes/components/FolderDialogs';
import { NoteTree } from '../features/notes/components/NoteTree';
import { OrganizeDialog } from '../features/organize/components/OrganizeDialog';
import { VaultSwitcher } from '../features/vault/components/VaultSwitcher';
import { getBlink } from '../shared/api/blink';
import styles from './Sidebar.module.css';

const modifierKey = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

export function Sidebar({ onOpenSearch }: { onOpenSearch(): void }) {
  const { data: appInfo } = useQuery({
    queryKey: ['app', 'info'],
    queryFn: () => getBlink().app.getInfo(),
    staleTime: Infinity,
  });
  const createNote = useCreateNote();
  // 새 노트·새 폴더가 생길 위치. '' = 보관함 맨 위
  const [selectedFolder, setSelectedFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [organizingRoot, setOrganizingRoot] = useState(false);
  const where = selectedFolder ? ` (${selectedFolder.split('/').pop()})` : '';

  return (
    <nav aria-label="Blink" className={`glass ${styles.sidebar}`}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden />
        Blink
      </div>
      <VaultSwitcher />

      <div className={styles.createRow}>
        <button
          type="button"
          className={`button-primary ${styles.newNote}`}
          title={`새 노트${where}`}
          disabled={createNote.isPending}
          onClick={() => createNote.mutate(selectedFolder || undefined)}
        >
          <Plus size={16} strokeWidth={1.75} />새 노트
        </button>
        <button
          type="button"
          className="button-icon"
          aria-label="새 폴더"
          title={`새 폴더${where}`}
          onClick={() => setCreatingFolder(true)}
        >
          <FolderPlus size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="button-icon"
          aria-label="보관함 분류하기"
          title="보관함 분류하기"
          onClick={() => setOrganizingRoot(true)}
        >
          <Sparkles size={16} strokeWidth={1.75} />
        </button>
      </div>

      <NoteTree selectedFolder={selectedFolder} onSelectFolder={setSelectedFolder} />

      <div className={styles.footer}>
        <button type="button" className={styles.navItem} onClick={onOpenSearch}>
          <Search size={16} strokeWidth={1.75} />
          검색
          <kbd className={styles.kbd}>{modifierKey} K</kbd>
        </button>
        <AIStatusChip />
        <NavLink to="/settings/ai" className={styles.navItem}>
          <Settings size={16} strokeWidth={1.75} />
          설정
        </NavLink>
        <span className={styles.version}>{appInfo ? `v${appInfo.version}` : ''}</span>
      </div>

      {creatingFolder && (
        <FolderDialog state={{ kind: 'create', parent: selectedFolder }} onClose={() => setCreatingFolder(false)} />
      )}
      {organizingRoot && <OrganizeDialog folder="" onClose={() => setOrganizingRoot(false)} />}
    </nav>
  );
}
