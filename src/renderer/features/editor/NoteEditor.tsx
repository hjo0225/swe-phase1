import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import type { ProseMirrorDocDto } from '../../../shared/ipc/notes';
import styles from './NoteEditor.module.css';
import { createEditorExtensions } from './extensions';

interface NoteEditorProps {
  initialContent: ProseMirrorDocDto;
  onReady(editor: Editor): void;
  onChange(editor: Editor): void;
}

/**
 * 노트 하나의 Tiptap 인스턴스. 열린 노트 본문의 유일한 작성자다(D-04).
 * 노트가 바뀌면 부모가 key로 새로 만든다 — 초기값 이후 props로 내용을 다시 주입하지 않는다.
 */
export function NoteEditor({ initialContent, onReady, onChange }: NoteEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: createEditorExtensions(),
    // DTO의 content는 unknown[]로 열어 두었으므로 편집기 JSON 타입으로 넘긴다 (형식은 Main이 검증).
    content: initialContent as JSONContent,
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
