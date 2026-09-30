import { useSyncExternalStore } from 'react';
import styles from './Toast.module.css';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick(): void };
}

const DURATION_MS = 4000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 일시적인 알림 (저장 실패, AI 요청 거절, 적용 불가 등). React 밖에서도 부를 수 있다. */
export const toast = {
  show(message: string, action?: ToastItem['action']): void {
    const id = nextId++;
    items = [...items, { id, message, action }];
    emit();
    setTimeout(() => toast.dismiss(id), DURATION_MS);
  },
  dismiss(id: number): void {
    items = items.filter((t) => t.id !== id);
    emit();
  },
};

export function Toaster() {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => items,
  );
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {current.map((t) => (
        <div key={t.id} className={`floating-chip ${styles.toast}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                toast.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function resetToastsForTests(): void {
  items = [];
  emit();
}
