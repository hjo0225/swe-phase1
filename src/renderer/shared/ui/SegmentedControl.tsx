import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** 묶음의 이름 (화면 읽기용) */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange(value: NoInfer<T>): void;
  disabled?: boolean;
}

/**
 * 몇 개 중 하나를 고르는 칸 (radiogroup). 고른 칸 뒤로 흰 손잡이가 미끄러진다.
 * 21st.dev halaska-studio "Segmented Control"(MIT)을 Cloud Glass 토큰과 CSS 모듈로 옮겼다.
 * 방향키·Home·End로 옮기면서 바로 고른다. Tab으로는 고른 칸에만 들어간다.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false }: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  // offset* 은 변형(transform) 전 배치 값이다 — 모달이 커지며 나타나는 동안에도 손잡이가 어긋나지 않는다
  useLayoutEffect(() => {
    const place = () => {
      const button = buttons.current.get(value);
      if (button) setThumb({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value, options]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value);
    const last = options.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % options.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + options.length) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null || disabled) return;
    event.preventDefault();
    const option = options[next]!;
    onChange(option.value);
    buttons.current.get(option.value)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={styles.group}
      onKeyDown={onKeyDown}
    >
      {thumb && <span aria-hidden className={styles.thumb} style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttons.current.set(option.value, el);
              else buttons.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected && !disabled ? 0 : -1}
            disabled={disabled}
            className={styles.option}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
