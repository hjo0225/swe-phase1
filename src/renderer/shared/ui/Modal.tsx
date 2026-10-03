import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose(): void;
}

/**
 * 화면 위에 띄우는 큰 창 (설정 등). 닫기 버튼·Escape·바깥 클릭으로 닫힌다. 내용이 길면 창 안에서 스크롤한다.
 * Dialog처럼 body에 그린다 — backdrop-filter가 있는 조상에 갇히지 않게.
 */
export function Modal({ title, children, onClose }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus?.(); // 닫으면 연 자리로 포커스를 돌려준다
    };
  }, []);

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass-elevated ${styles.panel}`}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className="button-icon" aria-label="닫기" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
