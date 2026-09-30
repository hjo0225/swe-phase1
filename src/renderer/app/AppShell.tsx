import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { noteKeys } from '../features/notes/api/note-queries';
import { getAutosave, onNoteSaved } from '../features/notes/autosave/autosave';
import { getBlink } from '../shared/api/blink';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const queryClient = useQueryClient();

  // 저장이 끝나면 목록(제목·미리보기·정렬)을 갱신한다. 열린 노트의 상세는 편집기가 진실이므로 건드리지 않는다.
  useEffect(
    () => onNoteSaved(() => void queryClient.invalidateQueries({ queryKey: noteKeys.list })),
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

  return (
    <div className={`app-background ${styles.shell}`}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
