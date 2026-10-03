import { FileText, FolderOpen, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import wordmark from '../../../assets/blink-wordmark.svg';
import { useOpenVault } from '../api/vault-queries';
import { FolderArt } from './FolderArt';
import styles from './VaultPicker.module.css';

const OPEN_ERRORS: Partial<Record<string, string>> = {
  VAULT_NOT_FOUND: '폴더가 없습니다. 옮겨졌거나 삭제되었을 수 있습니다.',
  VAULT_NOT_ACCESSIBLE: '폴더를 열 수 없습니다. 읽기·쓰기 권한을 확인해 주세요.',
};

/** 보관함이 없을 때의 첫 화면 (D-14): 폴더 그림 + 폴더 열기 + 약속 두 줄. 최근 보관함은 사이드바 보관함 전환에서 고른다. */
export function VaultPicker() {
  const openVault = useOpenVault();
  // 폴더 열기 버튼에 마우스·포커스가 있거나 폴더 고르는 창이 떠 있는 동안 그림 속 폴더가 열린다
  const [pointing, setPointing] = useState(false);
  const error = openVault.error
    ? (openVault.error instanceof BlinkIpcError && OPEN_ERRORS[openVault.error.code]) || '보관함을 열지 못했습니다.'
    : null;

  return (
    <div className={`app-background ${styles.screen}`}>
      <section className={`paper ${styles.card}`} aria-labelledby="vault-picker-title">
        <img src={wordmark} alt="Blink" className={styles.wordmark} />
        <FolderArt open={pointing || openVault.isPending} />
        <h1 id="vault-picker-title" className={styles.title}>
          보관함 열기
        </h1>
        <button
          type="button"
          className={`button-primary ${styles.open}`}
          disabled={openVault.isPending}
          onClick={() => openVault.mutate(undefined)}
          onMouseEnter={() => setPointing(true)}
          onMouseLeave={() => setPointing(false)}
          onFocus={() => setPointing(true)}
          onBlur={() => setPointing(false)}
        >
          <FolderOpen size={16} strokeWidth={1.75} />
          폴더 열기
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <ul className={styles.promises} aria-label="Blink의 약속">
          <li>
            <FileText size={14} strokeWidth={1.75} aria-hidden />
            Markdown 파일 그대로 저장
          </li>
          <li>
            <Sparkles size={14} strokeWidth={1.75} aria-hidden />
            AI는 선택한 부분에만
          </li>
        </ul>
      </section>
    </div>
  );
}
