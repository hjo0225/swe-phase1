import { FolderPlus, Loader2, Search, Settings, Sparkles, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useCreateNote } from '../features/notes/api/note-queries';
import { FolderDialog } from '../features/notes/components/FolderDialogs';
import { NoteTree } from '../features/notes/components/NoteTree';
import { useOrganizing } from '../features/organize/api/organize-queries';
import { OrganizeDialog } from '../features/organize/components/OrganizeDialog';
import { VaultSwitcher } from '../features/vault/components/VaultSwitcher';
import wordmark from '../assets/blink-wordmark.svg';
import styles from './Sidebar.module.css';

const modifierKey = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

export function Sidebar({ onOpenSearch }: { onOpenSearch(): void }) {
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

      {/* 맨 위 검색칸 (21st Sidebar 5) — 누르면 검색 팔레트 */}
      <button type="button" className={styles.searchField} aria-label={`노트 검색 (${modifierKey} K)`} onClick={onOpenSearch}>
        <Search size={15} strokeWidth={1.75} aria-hidden />
        <span className={styles.searchPlaceholder}>노트 검색</span>
        <kbd className={styles.kbd}>{modifierKey} K</kbd>
      </button>

      <div
        role="group"
        aria-label="보관함 편집"
        aria-busy={organizing}
        inert={organizing}
        className={styles.editable}
        data-locked={organizing || undefined}
      >
        {/* 트리 머리: 만들기·분류 (21st Tree View) */}
        <div className={styles.treeHeader}>
          <span className={styles.treeLabel}>노트</span>
          <div className={styles.treeActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="새 노트"
              data-tip={`새 노트${where}`}
              disabled={createNote.isPending}
              onClick={() => createNote.mutate(selectedFolder || undefined)}
            >
              <SquarePen size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="새 폴더"
              data-tip={`새 폴더${where}`}
              onClick={() => setCreatingFolder(true)}
            >
              <FolderPlus size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="보관함 분류하기"
              data-tip="보관함 분류하기"
              onClick={() => setOrganizingRoot(true)}
            >
              <Sparkles size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <NoteTree selectedFolder={selectedFolder} onSelectFolder={setSelectedFolder} />
      </div>
      {organizing && (
        <div role="status" aria-label="AI 분류 상태" className={styles.organizing}>
          <Loader2 size={14} strokeWidth={2} aria-hidden className={styles.spinner} />
          AI가 폴더를 정리하는 중… 끝날 때까지 폴더와 노트를 바꿀 수 없습니다
        </div>
      )}

      {/* 맨 아래: 보관함 전환(분류 중에는 잠김) + 설정. 앱 버전은 설정 화면에서만 보인다 */}
      <div className={styles.footer}>
        <div className={styles.vault} inert={organizing}>
          <VaultSwitcher placement="up" />
        </div>
        <NavLink to="/settings/ai" className={styles.settingsLink} aria-label="설정" data-tip="설정">
          <Settings size={17} strokeWidth={1.75} />
        </NavLink>
      </div>

      {creatingFolder && (
        <FolderDialog state={{ kind: 'create', parent: selectedFolder }} onClose={() => setCreatingFolder(false)} />
      )}
      {organizingRoot && <OrganizeDialog folder="" onClose={() => setOrganizingRoot(false)} />}
    </nav>
  );
}
