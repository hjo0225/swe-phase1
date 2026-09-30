import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Capabilities } from '../../../../shared/assist/capabilities';
import type { TestProviderInput, UpdateProviderInput } from '../../../../shared/ipc/ai-provider';
import { getBlink } from '../../../shared/api/blink';

export const settingsKeys = { provider: ['settings', 'provider'] as const };

export function useProviderSettings() {
  return useQuery({ queryKey: settingsKeys.provider, queryFn: () => getBlink().settings.getProvider() });
}

/** 활성 모델의 Capability. 설정이 없으면 null → AI 버튼 전체 비활성. */
export function useActiveCapabilities(): Capabilities | null | undefined {
  const { data } = useProviderSettings();
  return data === undefined ? undefined : (data.active?.capabilities ?? null);
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProviderInput) => getBlink().settings.updateProvider(input),
    onSuccess: (view) => queryClient.setQueryData(settingsKeys.provider, view),
  });
}

export function useTestProvider() {
  return useMutation({ mutationFn: (input: TestProviderInput) => getBlink().settings.testProvider(input) });
}
