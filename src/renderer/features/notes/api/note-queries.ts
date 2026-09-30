import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getBlink } from '../../../shared/api/blink';
import { getAutosave } from '../autosave/autosave';

export const noteKeys = {
  all: ['notes'] as const,
  list: ['notes', 'list'] as const,
  detail: (id: string) => ['notes', 'detail', id] as const,
};

export function useNoteList() {
  return useQuery({
    queryKey: noteKeys.list,
    queryFn: async () => (await getBlink().notes.list()).items,
  });
}

/**
 * 편집기 초기값으로만 쓴다. 열린 노트의 진실은 편집기이므로 다시 가져오지 않고(staleTime ∞),
 * 닫으면 버린다(gcTime 0). 가져오기 전에 대기 중인 저장을 끝내 오래된 본문을 읽지 않게 한다.
 */
export function useNoteDetail(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: async () => {
      await getAutosave().get(id).flush();
      return getBlink().notes.get({ id });
    },
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => getBlink().notes.create({}),
    onSuccess: (note) => {
      queryClient.setQueryData(noteKeys.detail(note.id), note);
      void queryClient.invalidateQueries({ queryKey: noteKeys.list });
      void navigate(`/notes/${note.id}`);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (id: string) => {
      getAutosave().discard(id); // 삭제할 노트의 대기 저장은 버린다
      return getBlink().notes.delete({ id });
    },
    onSuccess: async (_result, id) => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: noteKeys.list });
      void navigate('/'); // 시작 화면이 가장 최근 노트로 안내한다
    },
  });
}
