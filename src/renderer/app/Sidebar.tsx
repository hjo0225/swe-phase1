import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Loader2, Plus, Search, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useCreateNote } from '../features/notes/api/note-queries';
import { FolderDialog } from '../features/notes/components/FolderDialogs';
import { NoteTree } from '../features/notes/components/NoteTree';
import { useOrganizing } from '../features/organize/api/organize-queries';
import { OrganizeDialog } from '../features/organize/components/OrganizeDialog';
import { VaultSwitcher } from '../features/vault/components/VaultSwitcher';
import wordmark from '../assets/blink-wordmark.svg';
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
  // AI가 분류하는 동안 보관함 구조를 바꾸는 곳(전환·만들기·트리)을 잠근다. Main도 VAULT_BUSY로 거절한다.
  const organizing = useOrganizing();
  const where = selectedFolder ? ` (${selectedFolder.split('/').pop()})` : '';

  return (
    <nav aria-label="Blink" className={`glass ${styles.sidebar}`}>
      <div className={styles.brand}>
        <img src={wordmark} alt="Blink" className={styles.wordmark} />
      </div>
      <div
        role="group"
        aria-label="보관함 편집"
        aria-busy={organizing}
        inert={organizing}
        className={styles.editable}
        data-locked={organizing || undefined}
      >
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
      </div>
      {organizing && (
        <div role="status" aria-label="AI 분류 상태" className={styles.organizing}>
          <Loader2 size={14} strokeWidth={2} aria-hidden className={styles.spinner} />
          AI가 폴더를 정리하는 중… 끝날 때까지 폴더와 노트를 바꿀 수 없습니다
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.navItem} onClick={onOpenSearch}>
          <Search size={16} strokeWidth={1.75} />
          검색
          <kbd className={styles.kbd}>{modifierKey} K</kbd>
        </button>
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
