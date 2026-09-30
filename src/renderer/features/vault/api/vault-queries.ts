import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VaultInfo } from '../../../../shared/ipc/notes';
import { getBlink } from '../../../shared/api/blink';
import { getAutosave } from '../../notes/autosave/autosave';

export const vaultKeys = {
  current: ['vault', 'current'] as const,
  recent: ['vault', 'recent'] as const,
};

export function useCurrentVault() {
  return useQuery({ queryKey: vaultKeys.current, queryFn: () => getBlink().vault.getCurrent(), staleTime: Infinity });
}

export function useRecentVaults() {
  return useQuery({ queryKey: vaultKeys.recent, queryFn: async () => (await getBlink().vault.listRecent()).items });
}

/**
 * 보관함 열기·바꾸기 (UC-VAULT-001). root가 없으면 폴더 선택 Dialog를 띄운다.
 * 바꾸기 전에 대기 중인 저장을 옛 보관함에 끝내고, 바뀐 뒤에는 캐시 전체를 비우고 처음 화면으로 간다.
 */
export function useOpenVault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (root?: string): Promise<VaultInfo | null> => {
      await getAutosave().flushAll();
      return root ? getBlink().vault.open({ root }) : getBlink().vault.choose();
    },
    onSuccess: (vault) => {
      if (!vault) return; // Dialog 취소
      window.location.hash = '#/';
      // 보관함 쿼리는 게이트가 구독 중이라 지우지 않고 값만 바꾼다 (clear()는 구독 중인 옵저버와 캐시를 끊는다).
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'vault' });
      queryClient.setQueryData(vaultKeys.current, vault);
      void queryClient.invalidateQueries({ queryKey: vaultKeys.recent });
    },
  });
}
