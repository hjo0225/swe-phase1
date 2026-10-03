import { useEditorState, type Editor } from '@tiptap/react';
import { ChevronRight, FileText } from 'lucide-react';
import type { NoteDetail } from '../../../../shared/ipc/notes';
import { useCurrentVault } from '../../vault/api/vault-queries';
import { useNoteList } from '../api/note-queries';
import { countCharacters, formatNoteStats } from '../model/note-stats';
import styles from './NotePage.module.css';

/** 지금 노트의 위치 `보관함 › 폴더 › 노트` (21st Rich Text Editor 머리줄). 이름이 바뀌면 트리를 따라간다. */
export function NoteBreadcrumb({ note }: { note: NoteDetail }) {
  const { data: vault } = useCurrentVault();
  const { data: notes } = useNoteList();
  const current = notes?.find((n) => n.id === note.id);
  const path = current?.path ?? note.path;
  const folders = path.split('/').slice(0, -1);
  const crumbs = [vault?.name ?? '보관함', ...folders];

  return (
    <nav aria-label="노트 위치" className={styles.breadcrumb}>
      <FileText size={15} strokeWidth={1.75} aria-hidden className={styles.breadcrumbIcon} />
      <ol>
        {crumbs.map((name, i) => (
          <li key={`${i}:${name}`}>
            {name}
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden />
          </li>
        ))}
        <li aria-current="page" className={styles.breadcrumbCurrent}>
          {current?.title ?? note.title}
        </li>
      </ol>
    </nav>
  );
}

/** 제목 아래 정보 줄 `2분 전 수정 · 1,240자 · 약 3분` (21st Article 레이아웃). */
export function NoteStats({ note, editor }: { note: NoteDetail; editor: Editor | null }) {
  const { data: notes } = useNoteList();
  const updatedAt = notes?.find((n) => n.id === note.id)?.updatedAt ?? note.updatedAt;
  const characters =
    useEditorState({
      editor,
      selector: ({ editor: e }) => (e ? countCharacters(e.state.doc.textBetween(0, e.state.doc.content.size, '\n')) : 0),
    }) ?? 0;
  return <p className={styles.stats}>{formatNoteStats({ updatedAt, characters })}</p>;
}
