import type { ReactNode } from 'react';
import type { VaultInfo } from '../../../../shared/ipc/notes';
import { useCurrentVault } from '../api/vault-queries';
import { VaultPicker } from './VaultPicker';

/**
 * 라우터 바깥의 보관함 게이트 (docs/frontend/route-map.md). 열린 보관함이 없으면 선택 화면을 보인다.
 * children은 보관함마다 새로 만든다 — 다른 보관함의 화면 상태가 섞이지 않게.
 */
export function VaultGate({ children }: { children: (vault: VaultInfo) => ReactNode }) {
  const { data: vault, isPending } = useCurrentVault();
  if (isPending) return null;
  if (!vault) return <VaultPicker />;
  return children(vault);
}
