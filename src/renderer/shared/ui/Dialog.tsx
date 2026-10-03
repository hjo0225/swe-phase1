import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose(): void;
}

/**
 * Glass Elevated 모달. 브라우저 confirm()은 쓰지 않는다.
 * body에 그린다 — 사이드바처럼 backdrop-filter가 있는 조상 안에서 열면 position: fixed가 그 조상에 갇혀 화면 가운데에 뜨지 않는다.
 */
export function Dialog({ title, children, actions, onClose }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`glass-elevated ${styles.panel}`}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children && <div className={styles.body}>{children}</div>}
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
