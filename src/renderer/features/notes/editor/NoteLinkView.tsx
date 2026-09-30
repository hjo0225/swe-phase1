import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router';
import { useNoteList } from '../api/note-queries';
import styles from './NoteLinkView.module.css';

/**
 * 링크 표시: 대상의 현재 제목(없으면 삽입 시점 label), 대상이 사라졌으면 깨진 링크.
 * 제목·존재 여부는 사이드바가 이미 구독 중인 노트 목록에서 읽는다 — 방금 넣은 링크도 저장 전부터 정상 표시된다.
 */
export function NoteLinkView({ node }: ReactNodeViewProps) {
  const { noteId, label } = node.attrs as { noteId: string; label: string };
  const { data: notes } = useNoteList();
  const navigate = useNavigate();

  const target = notes?.find((n) => n.id === noteId);
  const broken = notes !== undefined && target === undefined;
  const title = target?.title ?? label;

  return (
    <NodeViewWrapper as="span" className={styles.wrapper}>
      {broken ? (
        <span className={styles.broken} title="삭제된 노트입니다">
          {title}
        </span>
      ) : (
        <a
          href={`#/notes/${noteId}`}
          className={styles.link}
          onClick={(event) => {
            event.preventDefault();
            void navigate(`/notes/${noteId}`);
          }}
        >
          {title}
        </a>
      )}
    </NodeViewWrapper>
  );
}
