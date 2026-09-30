import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getBlink } from '../../../shared/api/blink';
import { getAutosave } from '../autosave/autosave';

export const noteKeys = {
  all: ['notes'] as const,
  list: ['notes', 'list'] as const,
  detail: (id: string) => ['notes', 'detail', id] as const,
  /** 검색 팔레트 미리보기·가져오기용. 편집기 초기값(detail)과 캐시 수명이 달라 키를 나눈다. */
  preview: (id: string) => ['notes', 'preview', id] as const,
  search: (query: string, excludeNoteId?: string) => ['notes', 'search', query, excludeNoteId ?? null] as const,
  links: ['notes', 'links'] as const,
  linksOf: (id: string) => ['notes', 'links', id] as const,
};

export function useNoteSearch(query: string, excludeNoteId?: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: noteKeys.search(trimmed, excludeNoteId),
    queryFn: async () => (await getBlink().notes.search({ query: trimmed, excludeNoteId })).items,
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useNoteLinks(noteId: string) {
  return useQuery({
    queryKey: noteKeys.linksOf(noteId),
    queryFn: () => getBlink().notes.listLinks({ noteId }),
  });
}

export function fetchNotePreview(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  return queryClient.fetchQuery({
    queryKey: noteKeys.preview(id),
    queryFn: () => getBlink().notes.get({ id }),
    staleTime: 0,
  });
}

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
      // 상세 캐시를 setQueryData로 미리 채우지 않는다. 그렇게 만든 캐시는 기본 gcTime(5분)을 갖고,
      // gcTime은 늘어나기만 해서 useNoteDetail의 gcTime: 0이 적용되지 않는다 → 다시 열 때 생성 시점의 빈 노트가 보이고,
      // 그 위에 입력하면 저장된 본문을 덮어쓴다.
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
