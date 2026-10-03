import { ChevronsUpDown, FolderOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCurrentVault, useOpenVault, useRecentVaults } from '../api/vault-queries';
import styles from './VaultSwitcher.module.css';

/** 사이드바 맨 아래: 현재 보관함 이름 · 최근 보관함으로 바꾸기 · 다른 폴더 열기. placement='up'이면 메뉴가 위로 열린다. */
export function VaultSwitcher({ placement = 'down' }: { placement?: 'down' | 'up' }) {
  const { data: vault } = useCurrentVault();
  const { data: recent = [] } = useRecentVaults();
  const openVault = useOpenVault();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const others = recent.filter((v) => v.exists && v.root !== vault?.root);
  const choose = (root?: string) => {
    setOpen(false);
    openVault.mutate(root);
  };

  return (
    <div ref={ref} className={styles.anchor}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Vault: ${vault?.name ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={vault?.root}
        onClick={() => setOpen((v) => !v)}
      >
        <FolderOpen size={15} strokeWidth={1.75} aria-hidden />
        <span className={styles.name}>{vault?.name}</span>
        <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div role="menu" className={`glass-elevated ${styles.menu}`} data-placement={placement}>
          {others.map((v) => (
            <button key={v.root} type="button" role="menuitem" title={v.root} onClick={() => choose(v.root)}>
              {v.name}
            </button>
          ))}
          {others.length > 0 && <hr />}
          <button type="button" role="menuitem" onClick={() => choose()}>
            Open another folder…
          </button>
        </div>
      )}
    </div>
  );
}
