import { FolderOpen } from 'lucide-react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { useOpenVault, useRecentVaults } from '../api/vault-queries';
import styles from './VaultPicker.module.css';

const OPEN_ERRORS: Partial<Record<string, string>> = {
  VAULT_NOT_FOUND: '폴더가 없습니다. 옮겨졌거나 삭제되었을 수 있습니다.',
  VAULT_NOT_ACCESSIBLE: '폴더를 열 수 없습니다. 읽기·쓰기 권한을 확인해 주세요.',
};

/** 보관함이 없을 때의 첫 화면 (D-14): 폴더 열기 + 최근 보관함. */
export function VaultPicker() {
  const { data: recent = [] } = useRecentVaults();
  const openVault = useOpenVault();
  const error = openVault.error
    ? (openVault.error instanceof BlinkIpcError && OPEN_ERRORS[openVault.error.code]) || '보관함을 열지 못했습니다.'
    : null;

  return (
    <div className={`app-background ${styles.screen}`}>
      <section className={`paper ${styles.card}`} aria-labelledby="vault-picker-title">
        <span className={styles.logo} aria-hidden />
        <h1 id="vault-picker-title" className={styles.title}>
          보관함 열기
        </h1>
        <p className={styles.body}>
          노트를 둘 폴더를 고르세요. 노트는 그 폴더 안에 .md 파일로 저장되고, 폴더 구조가 그대로 사이드바에 보입니다.
        </p>
        <button
          type="button"
          className="button-primary"
          disabled={openVault.isPending}
          onClick={() => openVault.mutate(undefined)}
        >
          <FolderOpen size={16} strokeWidth={1.75} />
          폴더 열기
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {recent.length > 0 && (
          <div className={styles.recent}>
            <h2 className={styles.recentTitle}>최근 보관함</h2>
            <ul>
              {recent.map((vault) => (
                <li key={vault.root}>
                  <button
                    type="button"
                    className={styles.recentItem}
                    disabled={!vault.exists || openVault.isPending}
                    title={vault.exists ? vault.root : '폴더를 찾을 수 없습니다'}
                    onClick={() => openVault.mutate(vault.root)}
                  >
                    <span className={styles.recentName}>{vault.name}</span>
                    <span className={styles.recentPath}>{vault.root}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
