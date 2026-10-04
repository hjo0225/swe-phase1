import { useQuery } from '@tanstack/react-query';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { getBlink } from '../../../shared/api/blink';
import { createEditorExtensions } from '../../editor/extensions';
import { noteKeys } from '../api/note-queries';
import styles from './SearchPalette.module.css';

interface NotePreviewPaneProps {
  noteId: string;
  onImportAll(): void;
  onImportSelection(content: JSONContent[]): void;
}

/** 검색 결과 원본을 읽기 전용으로 보여 주고, 선택한 부분만 가져올 수 있게 한다. */
export function NotePreviewPane({ noteId, onImportAll, onImportSelection }: NotePreviewPaneProps) {
  const { data: note } = useQuery({
    queryKey: noteKeys.preview(noteId),
    queryFn: () => getBlink().notes.get({ id: noteId }),
  });
  const [hasSelection, setHasSelection] = useState(false);

  const editor = useEditor(
    {
      extensions: createEditorExtensions({ placeholder: '', noteId }),
      editable: false,
      content: note?.content ?? '',
      contentType: 'markdown',
      editorProps: { attributes: { 'aria-label': 'Preview', class: styles.previewProse ?? '' } },
      onSelectionUpdate: ({ editor: e }) => setHasSelection(!e.state.selection.empty),
    },
    [note],
  );

  useEffect(() => setHasSelection(false), [noteId]);

  const importSelection = () => {
    if (!editor || editor.state.selection.empty) return;
    const slice = editor.state.selection.content();
    onImportSelection(slice.content.toJSON() as JSONContent[]);
  };

  return (
    <section className={styles.preview} aria-label="Note preview">
      <EditorContent editor={editor} className={styles.previewBody} />
      <div className={styles.previewActions}>
        <button type="button" className="button-secondary" disabled={!hasSelection} onClick={importSelection}>
          Import selection
        </button>
        <button type="button" className="button-secondary" onClick={onImportAll}>
          Import all
        </button>
      </div>
    </section>
  );
}
