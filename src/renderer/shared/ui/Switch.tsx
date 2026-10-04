import { useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  label: string;
  /** 지금 상태에서 무슨 일이 일어나는지 한 줄로 */
  hint?: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

/**
 * 켜고 끄는 설정 한 줄: 스위치 + 이름 + 아래 작은 안내.
 * 21st.dev halaska-studio "Switch"(MIT)를 Cloud Glass 토큰과 CSS 모듈로 옮겼다. 이름 글자를 눌러도 바뀐다.
 */
export function Switch({ label, hint, checked, onChange }: SwitchProps) {
  const hintId = useId();
  return (
    <div className={styles.row}>
      <label className={styles.label}>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={hint ? hintId : undefined}
          className={styles.track}
          onClick={() => onChange(!checked)}
        >
          <span aria-hidden className={styles.knob} />
        </button>
        <span className={styles.text}>{label}</span>
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
