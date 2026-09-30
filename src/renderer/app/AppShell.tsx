import { Outlet } from 'react-router';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className={`app-background ${styles.shell}`}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
