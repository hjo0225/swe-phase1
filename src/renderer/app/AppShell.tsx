import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { ActiveEditorProvider } from '../features/editor/ActiveEditorContext';
import { noteKeys } from '../features/notes/api/note-queries';
import { getAutosave, onNoteSaved } from '../features/notes/autosave/autosave';
import { SearchPalette } from '../features/notes/components/SearchPalette';
import { getBlink } from '../shared/api/blink';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);

  // 저장이 끝나면 목록(제목·미리보기·정렬)과 링크를 갱신한다. 열린 노트의 상세는 편집기가 진실이므로 건드리지 않는다.
  useEffect(
    () =>
      onNoteSaved(() => {
        void queryClient.invalidateQueries({ queryKey: noteKeys.list });
        void queryClient.invalidateQueries({ queryKey: noteKeys.links });
      }),
    [queryClient],
  );

  // D-12: 창을 닫기 전에 대기 중인 자동 저장을 모두 끝낸다.
  useEffect(
    () =>
      getBlink().app.onWillClose(() => {
        void getAutosave()
          .flushAll()
          .finally(() => getBlink().app.readyToClose());
      }),
    [],
  );

  // ⌘/Ctrl + K: 검색 팔레트
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ActiveEditorProvider>
      <div className={`app-background ${styles.shell}`}>
        <Sidebar onOpenSearch={() => setSearchOpen(true)} />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </ActiveEditorProvider>
  );
}
