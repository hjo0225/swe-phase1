import { Navigate, type RouteObject } from 'react-router';
import { NotePage } from '../features/notes/components/NotePage';
import { StartScreen } from '../features/notes/components/StartScreen';
import { PrintNotePage } from '../features/print/PrintNotePage';
import { AppShell } from './AppShell';

/** docs/frontend/route-map.md */
export const routes: RouteObject[] = [
  // PDF 내보내기용 인쇄 화면: 앱 화면(AppShell) 없이 노트만. Main의 숨은 인쇄 창이 연다
  { path: '/print/:noteId', element: <PrintNotePage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: 'notes/:noteId', element: <NotePage /> },
      // 예전 주소: 처음 화면 위에 설정 모달을 연다
      { path: 'settings/ai', element: <Navigate to={{ pathname: '/', search: '?settings' }} replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
