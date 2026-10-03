import { useState } from 'react';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';

interface NameDialogProps {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  /** 서버 오류 문구 (이름 중복 등) */
  error?: string | null;
  busy?: boolean;
  onSubmit(name: string): void;
  onClose(): void;
}

/** 폴더 만들기·이름 바꾸기처럼 이름 하나를 받는 Dialog. */
export function NameDialog({ title, label, initialValue = '', confirmLabel, error, busy, onSubmit, onClose }: NameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button-primary" disabled={busy || !value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <input
        data-autofocus
        className={styles.input}
        aria-label={label}
        aria-invalid={Boolean(error)}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </Dialog>
  );
}
