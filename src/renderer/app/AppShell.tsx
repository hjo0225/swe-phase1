import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { SettingsModal } from '../features/ai-settings/components/SettingsPage';
import { useJobEvents } from '../features/assist/api/job-queries';
import { ActiveEditorProvider } from '../features/editor/ActiveEditorContext';
import { noteKeys } from '../features/notes/api/note-queries';
import { getAutosave, onNoteSaved } from '../features/notes/autosave/autosave';
import { SearchPalette } from '../features/notes/components/SearchPalette';
import { getBlink } from '../shared/api/blink';
import { Toaster } from '../shared/ui/toast';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  // 설정은 주소의 ?settings로 연다 — 지금 보던 노트는 뒤에 그대로 남는다
  const [searchParams, setSearchParams] = useSearchParams();
  const settingsOpen = searchParams.has('settings');
  const closeSettings = () =>
    setSearchParams(
      (params) => {
        params.delete('settings');
        return params;
      },
      { replace: true },
    );
  useJobEvents();

  // 저장이 끝나면 트리(미리보기·수정 시각)와 링크를 갱신한다. 열린 노트의 상세는 편집기가 진실이므로 건드리지 않는다.
  useEffect(
    () =>
      onNoteSaved(() => {
        void queryClient.invalidateQueries({ queryKey: noteKeys.tree });
        void queryClient.invalidateQueries({ queryKey: noteKeys.links });
      }),
    [queryClient],
  );

  // 보관함 폴더가 밖에서 바뀌었다 (다른 앱, 탐색기). 열린 노트는 NotePage가 따로 처리한다.
  useEffect(
    () =>
      getBlink().vault.onChanged(() => {
        void queryClient.invalidateQueries({ queryKey: noteKeys.tree });
        void queryClient.invalidateQueries({ queryKey: noteKeys.links });
        void queryClient.invalidateQueries({ queryKey: ['notes', 'search'] });
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
        <main className={styles.main} data-scroll-root>
          <Outlet />
        </main>
      </div>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
      <Toaster />
    </ActiveEditorProvider>
  );
}
