import styles from './placeholders.module.css';

// Stage 4에서 AI 설정 화면으로 교체되는 자리표시자.
export function SettingsPlaceholder() {
  return (
    <section className={`paper ${styles.panel}`}>
      <h1 className={styles.title}>AI 설정</h1>
      <p className={styles.body}>Provider, API Key, 모델을 설정합니다.</p>
    </section>
  );
}
