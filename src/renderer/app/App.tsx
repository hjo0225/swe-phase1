import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { VaultGate } from '../features/vault/components/VaultGate';
import { routes } from './router';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <VaultGate>{(vault) => <VaultRouter key={vault.root} />}</VaultGate>
    </QueryClientProvider>
  );
}

/** 보관함마다 새 라우터 — 보관함을 바꾸면 화면 상태(열린 노트, 편집기)를 처음부터 만든다. */
function VaultRouter() {
  const [router] = useState(() => createHashRouter(routes));
  return <RouterProvider router={router} />;
}
