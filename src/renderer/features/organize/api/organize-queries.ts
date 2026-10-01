import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportNoteResult, OrganizePlan } from '../../../../shared/ipc/organize';
import { getBlink } from '../../../shared/api/blink';
import { noteKeys, notifyRelinked } from '../../notes/api/note-queries';
import { getAutosave } from '../../notes/autosave/autosave';

/** 노트가 옮겨진 뒤: 트리·링크를 다시 읽고, 링크가 고쳐진 열린 노트에 알린다. */
function useAfterMoves() {
  const queryClient = useQueryClient();
  return (updatedNoteIds: string[]) => {
    void queryClient.invalidateQueries({ queryKey: noteKeys.links });
    void queryClient.invalidateQueries({ queryKey: noteKeys.tree });
    notifyRelinked(updatedNoteIds);
  };
}

export function useOrganizePreview() {
  return useMutation({ mutationFn: (folder: string) => getBlink().organize.preview({ folder }) });
}

/**
 * 옮기면 다른 노트의 링크를 고쳐 쓴다 — 대기 중인 저장이 고친 파일을 옛 링크로 덮지 않도록 먼저 모두 저장한다.
 * 실패해도 일부는 옮겨졌을 수 있어 목록은 늘 다시 읽는다.
 */
export function useOrganizeApply() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (plan: OrganizePlan) => {
      await getAutosave().flushAll();
      return getBlink().organize.apply(plan);
    },
    onSettled: (result) => afterMoves(result?.updatedNoteIds ?? []),
  });
}

export function usePlaceNote() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (id: string) => {
      await getAutosave().flushAll();
      return getBlink().organize.place({ id });
    },
    onSuccess: (result) => afterMoves(result.updatedNoteIds),
  });
}

/**
 * 끌어다 놓은 `.md` 파일을 하나씩 가져온다 (각각 놓은 폴더부터 자동 배치).
 * 중간 파일에서 실패해도 그 앞에서 가져온 노트가 목록에 보이도록 끝날 때마다 다시 읽는다.
 */
export function useImportNotes() {
  const afterMoves = useAfterMoves();
  return useMutation({
    mutationFn: async (input: { files: File[]; folder: string }) => {
      const blink = getBlink();
      const results: ImportNoteResult[] = [];
      try {
        for (const file of input.files) {
          results.push(await blink.organize.importFile({ sourcePath: blink.organize.pathForFile(file), folder: input.folder }));
        }
      } finally {
        afterMoves(results.flatMap((r) => r.updatedNoteIds));
      }
      return results;
    },
  });
}
