import type { Editor } from '@tiptap/react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { NoteDetail } from '../../../../shared/ipc/notes';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { getBlink } from '../../../shared/api/blink';
import { Dialog } from '../../../shared/ui/Dialog';
import { AIActionBubble } from '../../assist/components/AIActionBubble';
import { useAssistBridge } from '../../assist/components/use-assist-bridge';
import { useActiveEditor } from '../../editor/ActiveEditorContext';
import { FormattingToolbar } from '../../editor/FormattingToolbar';
import { NoteEditor } from '../../editor/NoteEditor';
import { NoteToc } from '../../editor/NoteToc';
import { onNotesRelinked, useDeleteNote, useNoteDetail } from '../api/note-queries';
import { getAutosave, type NotePayload } from '../autosave/autosave';
import { BacklinksPanel } from './BacklinksPanel';
import { NoteBreadcrumb, NoteStats } from './NoteChrome';
import styles from './NotePage.module.css';
import { SaveIndicator } from './SaveIndicator';
import { TitleInput } from './TitleInput';

export function NotePage() {
  const { noteId = '' } = useParams();
  const detail = useNoteDetail(noteId);

  // 밖에서 바뀐 파일을 다시 불러온다. 대기 중인 편집은 버린다 (사용자가 배너에서 고른 경우 또는 편집이 없을 때).
  const reload = useCallback(() => {
    getAutosave().get(noteId).cancel();
    void detail.refetch();
  }, [noteId, detail]);

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
  // 노트마다(그리고 다시 불러올 때마다) 편집 상태를 새로 만든다.
  return <NoteWorkspace key={`${detail.data.id}:${detail.dataUpdatedAt}`} note={detail.data} onReload={reload} />;
}

function NoteWorkspace({ note, onReload }: { note: NoteDetail; onReload(): void }) {
  const queue = getAutosave().get(note.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [changedOutside, setChangedOutside] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const deleteNote = useDeleteNote();
  const { setActive } = useActiveEditor();

  // 저장 시점에 최신 본문을 읽는다.
  const payload = useCallback(
    (): NotePayload => ({ content: editorRef.current?.getMarkdown() ?? note.content }),
    [note.content],
  );

  // 다른 노트로 이동할 때 대기 중인 저장을 바로 보낸다.
  useEffect(() => () => void queue.flush(), [queue]);

  // 파일이 밖에서(다른 앱, 링크 고치기) 바뀌었을 때: 편집이 없으면 바로 다시 불러오고, 있으면 고르게 한다.
  useEffect(() => {
    const handle = (noteIds: string[]) => {
      if (!noteIds.includes(note.id)) return;
      if (queue.hasPendingChanges) setChangedOutside(true);
      else onReload();
    };
    const offVault = getBlink().vault.onChanged((event) => handle(event.noteIds));
    const offRelinked = onNotesRelinked(handle);
    return () => {
      offVault();
      offRelinked();
    };
  }, [note.id, queue, onReload]);

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
    <article className={`paper ${styles.sheet}`}>
      {/* 21st Rich Text Editor: 위치·저장 상태 머리줄 + 서식 도구막대. 스크롤해도 위에 붙어 있다. */}
      <div className={styles.chrome}>
        <header className={styles.header}>
          <NoteBreadcrumb note={note} />
          <div className={styles.headerActions}>
            <SaveIndicator noteId={note.id} />
            <button type="button" className="button-icon" aria-label="노트 삭제" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>
        {editor && <FormattingToolbar editor={editor} />}
      </div>

      <div className={styles.body}>
        <div className={styles.content}>
          {/* 21st Article: 큰 제목과 그 아래 정보 줄 */}
          <TitleInput noteId={note.id} title={note.title} />
          <NoteStats note={note} editor={editor} />

          {changedOutside && (
            <div role="status" className={styles.banner}>
              <span>이 노트가 다른 곳에서 바뀌었습니다.</span>
              <button type="button" className="button-secondary" onClick={onReload}>
                <RefreshCw size={14} strokeWidth={1.75} />
                다시 불러오기
              </button>
              <button type="button" className={styles.bannerDismiss} onClick={() => setChangedOutside(false)}>
                내 편집 유지
              </button>
            </div>
          )}

          <NoteEditor initialMarkdown={note.content} onReady={onReady} onChange={() => queue.markDirty(payload)} />
          {editor && <AIActionBubble editor={editor} noteId={note.id} />}
          <BacklinksPanel noteId={note.id} />
        </div>
        {/* 21st Table of Contents: 제목이 둘 이상일 때만 */}
        <aside className={styles.tocColumn}>{editor && <NoteToc editor={editor} />}</aside>
      </div>

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
          삭제한 노트는 되돌릴 수 없습니다. 보관함 폴더의 .md 파일도 지워집니다.
        </Dialog>
      )}
    </article>
  );
}
