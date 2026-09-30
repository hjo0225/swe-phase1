import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router';
import { resolveLinkTarget } from '../../../../shared/notes/wiki-link';
import { useNoteList } from '../api/note-queries';
import styles from './NoteLinkView.module.css';

/**
 * 링크 표시: 별칭이 있으면 별칭, 없으면 대상 이름. 대상은 Main과 같은 규칙(resolveLinkTarget)으로 노트 트리에서 찾는다.
 * 찾지 못하면 깨진 링크 — 옵시디언처럼 나중에 같은 이름의 노트가 생기면 다시 이어진다.
 */
export function NoteLinkView({ node }: ReactNodeViewProps) {
  const { target, label } = node.attrs as { target: string; label: string };
  const { data: notes } = useNoteList();
  const navigate = useNavigate();

  const resolved = notes ? resolveLinkTarget(target, notes) : null;
  const broken = notes !== undefined && resolved === null;
  const text = label || target.split('/').pop() || target;

  return (
    <NodeViewWrapper as="span" className={styles.wrapper}>
      {broken || !resolved ? (
        <span className={styles.broken} title={broken ? `'${target}' 노트가 없습니다` : undefined}>
          {text}
        </span>
      ) : (
        <a
          href={`#/notes/${resolved.id}`}
          className={styles.link}
          onClick={(event) => {
            event.preventDefault();
            void navigate(`/notes/${resolved.id}`);
          }}
        >
          {text}
        </a>
      )}
    </NodeViewWrapper>
  );
}
