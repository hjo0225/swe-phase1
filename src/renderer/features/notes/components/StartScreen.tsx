import { Navigate, useLocation } from 'react-router';
import { useNoteList } from '../api/note-queries';

/** `#/`: 노트가 있으면 가장 최근 노트로. 없으면 오른쪽을 비워 둔다 (만들기는 사이드바에서). */
export function StartScreen() {
  const { data: notes } = useNoteList();
  const { search } = useLocation(); // ?settings가 있으면 옮겨 간 노트 위에서도 설정이 열려 있게

  if (!notes) return null;
  const latest = notes.reduce<(typeof notes)[number] | undefined>(
    (best, note) => (!best || note.updatedAt > best.updatedAt ? note : best),
    undefined,
  );
  return latest ? <Navigate to={{ pathname: `/notes/${latest.id}`, search }} replace /> : null;
}
