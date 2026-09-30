import { Navigate, type RouteObject } from 'react-router';
import { NotePage } from '../features/notes/components/NotePage';
import { StartScreen } from '../features/notes/components/StartScreen';
import { AppShell } from './AppShell';
import { SettingsPlaceholder } from './placeholders';

/** docs/frontend/route-map.md */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: 'notes/:noteId', element: <NotePage /> },
      { path: 'settings/ai', element: <SettingsPlaceholder /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
