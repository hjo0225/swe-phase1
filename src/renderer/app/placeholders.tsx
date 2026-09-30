import { useParams } from 'react-router';
import styles from './placeholders.module.css';

// Stage 2 이후 각 feature 화면으로 교체되는 자리표시자.

export function StartScreen() {
  return (
    <section className={`paper ${styles.panel}`}>
      <h1 className={styles.title}>첫 노트를 만들어 보세요</h1>
      <p className={styles.body}>생각을 적고, 선택한 부분을 AI로 구체화·정리·시각화할 수 있습니다.</p>
    </section>
  );
}

export function NotePlaceholder() {
  const { noteId } = useParams();
  return <section className={`paper ${styles.panel}`} data-testid="note-page" data-note-id={noteId} />;
}

export function SettingsPlaceholder() {
  return (
    <section className={`paper ${styles.panel}`}>
      <h1 className={styles.title}>AI 설정</h1>
      <p className={styles.body}>Provider, API Key, 모델을 설정합니다.</p>
    </section>
  );
}
