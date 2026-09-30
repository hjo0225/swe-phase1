import type { Editor } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { NoteDetail } from '../../../../shared/ipc/notes';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { Dialog } from '../../../shared/ui/Dialog';
import { AIActionBubble } from '../../assist/components/AIActionBubble';
import { useAssistBridge } from '../../assist/components/use-assist-bridge';
import { useActiveEditor } from '../../editor/ActiveEditorContext';
import { NoteEditor } from '../../editor/NoteEditor';
import { useDeleteNote, useNoteDetail } from '../api/note-queries';
import { getAutosave, type NotePayload } from '../autosave/autosave';
import { BacklinksPanel } from './BacklinksPanel';
import styles from './NotePage.module.css';
import { SaveIndicator } from './SaveIndicator';

const TITLE_MAX = 200;

export function NotePage() {
  const { noteId = '' } = useParams();
  const detail = useNoteDetail(noteId);

  if (detail.isPending) return <section className={`paper ${styles.page}`} aria-busy="true" />;
  if (detail.isError) {
    const notFound = detail.error instanceof BlinkIpcError && detail.error.code === 'NOTE_NOT_FOUND';
    return (
      <section className={`paper ${styles.page}`}>
        <h1 className={styles.stateTitle}>{notFound ? '노트를 찾을 수 없습니다' : '노트를 불러오지 못했습니다'}</h1>
        <p className={styles.stateBody}>{notFound ? '삭제되었거나 존재하지 않는 노트입니다.' : '잠시 후 다시 시도해 주세요.'}</p>
        {notFound ? (
          <Link to="/" className="button-secondary">
            목록으로
          </Link>
        ) : (
          <button type="button" className="button-secondary" onClick={() => void detail.refetch()}>
            다시 시도
          </button>
        )}
      </section>
    );
  }
  // 노트마다 편집 상태를 새로 만든다 (편집기 인스턴스, 제목 입력).
  return <NoteWorkspace key={detail.data.id} note={detail.data} />;
}

function NoteWorkspace({ note }: { note: NoteDetail }) {
  const queue = getAutosave().get(note.id);
  const [title, setTitle] = useState(note.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef(note.title);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const deleteNote = useDeleteNote();
  const { setActive } = useActiveEditor();

  // 저장 시점에 최신 제목·본문을 읽는다.
  const payload = useCallback(
    (): NotePayload => ({
      title: titleRef.current,
      content: (editorRef.current?.getJSON() as NotePayload['content'] | undefined) ?? note.content,
    }),
    [note.content],
  );

  // 다른 노트로 이동할 때 대기 중인 저장을 바로 보낸다.
  useEffect(() => () => void queue.flush(), [queue]);

  // 검색 팔레트가 연결·가져오기 대상으로 쓸 수 있게 현재 편집기를 등록한다.
  const onReady = useCallback(
    (ready: Editor) => {
      editorRef.current = ready;
      setEditor(ready);
      setActive(() => ({ noteId: note.id, editor: ready }));
    },
    [note.id, setActive],
  );
  useEffect(
    () => () => setActive((current) => (current?.noteId === note.id ? null : current)),
    [note.id, setActive],
  );

  // AI Job 상태 ↔ 편집기 (잠금·Pulse·Commit)
  useAssistBridge(note.id, editor);

  return (
    <article className={`paper ${styles.page}`}>
      <header className={styles.header}>
        <input
          className={styles.title}
          aria-label="노트 제목"
          placeholder="제목 없음"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            titleRef.current = event.target.value;
            queue.markDirty(payload);
          }}
        />
        <div className={styles.headerActions}>
          <SaveIndicator noteId={note.id} />
          <button type="button" className="button-icon" aria-label="노트 삭제" onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <NoteEditor initialContent={note.content} onReady={onReady} onChange={() => queue.markDirty(payload)} />
      {editor && <AIActionBubble editor={editor} noteId={note.id} />}
      <BacklinksPanel noteId={note.id} />

      {confirmingDelete && (
        <Dialog
          title="노트를 삭제할까요?"
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <button type="button" className="button-secondary" data-autofocus onClick={() => setConfirmingDelete(false)}>
                취소
              </button>
              <button
                type="button"
                className="button-danger"
                disabled={deleteNote.isPending}
                onClick={() => deleteNote.mutate(note.id)}
              >
                삭제
              </button>
            </>
          }
        >
          삭제한 노트는 되돌릴 수 없습니다.
        </Dialog>
      )}
    </article>
  );
}
