import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { NotePlaceholder, SettingsPlaceholder, StartScreen } from './placeholders';

/** docs/frontend/route-map.md */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: 'notes/:noteId', element: <NotePlaceholder /> },
      { path: 'settings/ai', element: <SettingsPlaceholder /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
