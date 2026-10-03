import styles from './FolderArt.module.css';

/**
 * 보관함 선택 화면의 폴더 그림 (21st.dev Folder Interaction을 Cloud Glass 톤·CSS 전환으로 옮김).
 * 꾸밈이라 보조 기술에는 숨긴다. 언제 열지는 부모가 정한다.
 */
export function FolderArt({ open = false }: { open?: boolean }) {
  return (
    <div className={styles.art} data-folder-art aria-hidden="true" data-open={open || undefined}>
      <div className={styles.back} />
      <div className={`${styles.page} ${styles.left}`} />
      <div className={`${styles.page} ${styles.center}`} />
      <div className={`${styles.page} ${styles.right}`} />
      <div className={styles.front} />
    </div>
  );
}
