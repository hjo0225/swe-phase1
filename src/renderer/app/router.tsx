import { Navigate, type RouteObject } from 'react-router';
import { NotePage } from '../features/notes/components/NotePage';
import { StartScreen } from '../features/notes/components/StartScreen';
import { AppShell } from './AppShell';

/** docs/frontend/route-map.md */
export const routes: RouteObject[] = [
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
