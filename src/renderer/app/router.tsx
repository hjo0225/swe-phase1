import { Navigate, type RouteObject } from 'react-router';
import { SettingsPage } from '../features/ai-settings/components/SettingsPage';
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
      { path: 'settings/ai', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
