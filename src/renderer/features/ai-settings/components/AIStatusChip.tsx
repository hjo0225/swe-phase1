import { useProviderSettings } from '../api/settings-queries';
import styles from './AIStatusChip.module.css';

/** 설정 화면 «사용 중»: 설정 완료면 Mint 점 + Provider·모델, 아니면 "AI not set up". */
export function AIStatusChip() {
  const { data } = useProviderSettings();
  const active = data?.active;
  const provider = active ? data.providers.find((p) => p.provider === active.provider) : undefined;
  const modelLabel = provider?.models.find((m) => m.id === active?.model)?.label ?? active?.model;

  return (
    <div className={`floating-chip ${styles.chip}`} data-active={Boolean(active)}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>{active && provider ? `${provider.label} · ${modelLabel}` : 'AI not set up'}</span>
    </div>
  );
}
