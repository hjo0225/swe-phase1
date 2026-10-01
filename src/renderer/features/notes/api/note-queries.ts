import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { NoteSummary, VaultTree } from '../../../../shared/ipc/notes';
import { getBlink } from '../../../shared/api/blink';
import { getAutosave } from '../autosave/autosave';

export const noteKeys = {
  all: ['notes'] as const,
  tree: ['notes', 'tree'] as const,
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

/** 보관함의 폴더와 노트 (경로순). */
export function useNoteTree<T = VaultTree>(select?: (tree: VaultTree) => T) {
  return useQuery({ queryKey: noteKeys.tree, queryFn: () => getBlink().notes.tree(), select });
}

const selectNotes = (tree: VaultTree) => tree.notes;

/** 트리의 노트만. 링크 해석·시작 화면용. */
export function useNoteList() {
  return useNoteTree<NoteSummary[]>(selectNotes);
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

/** 노트 구조가 바뀐 뒤: 트리·링크를 다시 읽는다. 트리만 기다린다 — 사라진 노트의 링크 조회는 재시도로 오래 걸릴 수 있다. */
function useInvalidateStructure() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: noteKeys.links });
    return queryClient.invalidateQueries({ queryKey: noteKeys.tree });
  };
}

export function useCreateNote() {
  const invalidate = useInvalidateStructure();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (folder: string | undefined = undefined) => getBlink().notes.create(folder ? { folder } : {}),
    onSuccess: (note) => {
      // 상세 캐시를 setQueryData로 미리 채우지 않는다. 그렇게 만든 캐시는 기본 gcTime(5분)을 갖고,
      // gcTime은 늘어나기만 해서 useNoteDetail의 gcTime: 0이 적용되지 않는다 → 다시 열 때 생성 시점의 빈 노트가 보이고,
      // 그 위에 입력하면 저장된 본문을 덮어쓴다.
      void invalidate();
      void navigate(`/notes/${note.id}`);
    },
  });
}

/**
 * 이름 변경·이동은 다른 노트의 링크를 고쳐 쓴다(UC-NOTE-010). 대기 중인 저장이 고친 파일을 옛 링크로 덮지 않도록 먼저 모두 저장한다.
 * 링크가 고쳐진 노트는 vault:changed와 같은 경로로 알린다.
 */
export function useRenameNote() {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) => {
      await getAutosave().flushAll();
      return getBlink().notes.rename(input);
    },
    onSuccess: (result) => {
      void invalidate();
      notifyRelinked(result.updatedNoteIds);
    },
  });
}

export function useMoveNote() {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: async (input: { id: string; folder: string }) => {
      await getAutosave().flushAll();
      return getBlink().notes.move(input);
    },
    onSuccess: (result) => {
      void invalidate();
      notifyRelinked(result.updatedNoteIds);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStructure();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (id: string) => {
      getAutosave().discard(id); // 삭제할 노트의 대기 저장은 버린다
      return getBlink().notes.delete({ id });
    },
    onSuccess: async (_result, id) => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      queryClient.removeQueries({ queryKey: noteKeys.linksOf(id) });
      await invalidate();
      void navigate('/'); // 시작 화면이 가장 최근 노트로 안내한다
    },
  });
}

export function useCreateFolder() {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: (input: { parent?: string; name: string }) => getBlink().folders.create(input),
    onSuccess: () => void invalidate(),
  });
}

export function useRenameFolder() {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: async (input: { path: string; name: string }) => {
      await getAutosave().flushAll();
      return getBlink().folders.rename(input);
    },
    onSuccess: (result) => {
      void invalidate();
      notifyRelinked(result.updatedNoteIds);
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStructure();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (path: string) => {
      const tree = queryClient.getQueryData<VaultTree>(noteKeys.tree);
      const inside = tree?.notes.filter((n) => n.path.toLowerCase().startsWith(`${path.toLowerCase()}/`)) ?? [];
      for (const note of inside) getAutosave().discard(note.id);
      return { result: await getBlink().folders.delete({ path }), removedIds: inside.map((n) => n.id) };
    },
    onSuccess: async ({ removedIds }) => {
      for (const id of removedIds) queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      await invalidate();
      if (removedIds.some((id) => window.location.hash.includes(id))) void navigate('/');
    },
  });
}

// 우리 쪽 작업(이름 변경·이동)으로 다른 노트 파일이 바뀐 것도 열린 노트에는 외부 변경과 같다.
const relinkListeners = new Set<(noteIds: string[]) => void>();

export function onNotesRelinked(listener: (noteIds: string[]) => void): () => void {
  relinkListeners.add(listener);
  return () => relinkListeners.delete(listener);
}

export function notifyRelinked(noteIds: string[]): void {
  if (noteIds.length === 0) return;
  for (const listener of relinkListeners) listener(noteIds);
}
