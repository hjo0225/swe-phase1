import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import styles from './NoteEditor.module.css';
import { createEditorExtensions } from './extensions';

interface NoteEditorProps {
  /** .md 파일 내용 (D-14) */
  initialMarkdown: string;
  onReady(editor: Editor): void;
  onChange(editor: Editor): void;
}

/**
 * 노트 하나의 Tiptap 인스턴스. 열린 노트 본문의 유일한 작성자다(D-04).
 * 노트가 바뀌면 부모가 key로 새로 만든다 — 초기값 이후 props로 내용을 다시 주입하지 않는다.
 */
export function NoteEditor({ initialMarkdown, onReady, onChange }: NoteEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: initialMarkdown,
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: styles.prose ?? '', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '노트 본문' },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e),
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  return <EditorContent editor={editor} className={styles.editor} />;
}
