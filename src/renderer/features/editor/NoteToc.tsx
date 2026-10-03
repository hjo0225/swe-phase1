import { useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import styles from './NoteToc.module.css';

interface TocHeading {
  pos: number;
  level: number;
  text: string;
}

const MIN_HEADINGS = 2;
/** 스크롤 영역 위쪽에서 이만큼 내려온 지점을 지나간 제목을 "지금 읽는 곳"으로 본다 */
const ACTIVE_OFFSET = 96;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 이 노트의 목차 — 21st.dev Table of Contents(mohammadshehadeh)의 구조를 편집기 문서에 맞게 옮겼다.
 * 제목은 편집기 문서에서 바로 읽고(편집하면 따라 바뀐다), 스크롤하면 지금 읽는 제목을 표시하고, 누르면 그 제목으로 이동한다.
 * 제목이 둘 이상일 때만 보인다.
 */
export function NoteToc({ editor }: { editor: Editor }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const found: TocHeading[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') found.push({ pos, level: node.attrs.level as number, text: node.textContent });
        return node.isBlock && node.type.name !== 'heading'; // 제목 안쪽은 볼 필요가 없다
      });
      return found.filter((h) => h.text.trim() !== '');
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const [activePos, setActivePos] = useState<number | null>(null);

  const domOf = (pos: number) => {
    try {
      return editor.view.nodeDOM(pos) as HTMLElement | null;
    } catch {
      return null;
    }
  };

  // 스크롤 영역(편집기를 품은 가장 가까운 스크롤 요소)을 따라 지금 읽는 제목을 찾는다.
  useEffect(() => {
    if (headings.length < MIN_HEADINGS) return;
    const root = editor.view.dom.closest<HTMLElement>('[data-scroll-root]');
    const target: HTMLElement | Window = root ?? window;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = (root?.getBoundingClientRect().top ?? 0) + ACTIVE_OFFSET;
        let current: number | null = null;
        for (const heading of headings) {
          const rect = domOf(heading.pos)?.getBoundingClientRect();
          if (rect && rect.top <= top) current = heading.pos;
        }
        setActivePos(current ?? headings[0]!.pos);
      });
    };
    update();
    target.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
    // domOf는 editor만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, headings]);

  if (headings.length < MIN_HEADINGS) return null;
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <nav aria-label="이 노트의 목차" className={styles.toc}>
      <p className={styles.label}>이 노트</p>
      <ul className={styles.list}>
        {headings.map((heading) => {
          const active = heading.pos === activePos;
          return (
            <li key={heading.pos}>
              <a
                href={`#heading-${heading.pos}`}
                data-level={heading.level}
                data-active={active || undefined}
                aria-current={active ? 'location' : undefined}
                className={styles.link}
                style={{ paddingLeft: 12 + (heading.level - minLevel) * 12 }}
                onClick={(event) => {
                  event.preventDefault();
                  domOf(heading.pos)?.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
                  setActivePos(heading.pos);
                }}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
