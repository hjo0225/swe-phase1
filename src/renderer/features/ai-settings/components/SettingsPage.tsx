import { useQuery } from '@tanstack/react-query';
import { Check, KeyRound, ShieldAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Capabilities } from '../../../../shared/assist/capabilities';
import type { ProviderId, ProviderSettingsView, TestProviderResult } from '../../../../shared/ipc/ai-provider';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { getBlink } from '../../../shared/api/blink';
import { toast } from '../../../shared/ui/toast';
import { CONNECTION_FAILURE_MESSAGE } from '../../assist/model/messages';
import { useProviderSettings, useTestProvider, useUpdateProvider } from '../api/settings-queries';
import { AIStatusChip } from './AIStatusChip';
import { Modal } from '../../../shared/ui/Modal';
import styles from './SettingsPage.module.css';

/** 비워 두면 쓰는 주소. Kimi 중국 계정은 https://api.moonshot.cn/v1 을 적는다. */
const DEFAULT_BASE_URL_HINT: Record<ProviderId, string> = {
  openai: 'Default: https://api.openai.com/v1',
  kimi: 'Default: https://api.moonshot.ai/v1 (China: api.moonshot.cn)',
};

const CAPABILITY_ROWS: { key: keyof Capabilities; label: string; enables: string }[] = [
  { key: 'generate', label: 'Text generation', enables: 'Organize' },
  { key: 'structuredOutput', label: 'Structured output', enables: 'Visualize' },
  { key: 'webSearch', label: 'Web search', enables: 'Expand' },
];

const FIELD_ERROR: Partial<Record<string, string>> = {
  PROVIDER_API_KEY_REQUIRED: 'Enter an API key',
  PROVIDER_MODEL_NOT_SUPPORTED: 'This model is not supported',
  PROVIDER_BASE_URL_INVALID: 'Enter an https:// address (or http://localhost)',
  PROVIDER_SECURE_STORAGE_UNAVAILABLE: 'Couldn\'t save the key because secure storage is unavailable',
};

/** UC-AIP-001~003. 설정 모달(SettingsModal) 안의 내용 */
export function SettingsPanel() {
  const { data, isPending, isError, refetch } = useProviderSettings();
  const { data: appInfo } = useQuery({ queryKey: ['app', 'info'], queryFn: () => getBlink().app.getInfo(), staleTime: Infinity });
  return (
    <section className={styles.panel}>
      <p className={styles.lead}>Choose your AI provider and model, and add your own API key. The key is encrypted in this computer's secure storage.</p>
      {/* 지금 쓰는 AI는 설정 화면에서만 보여 준다 */}
      <div className={styles.current}>
        <span className={styles.currentLabel}>In use</span>
        <AIStatusChip />
      </div>
      {isPending && <div className={styles.skeleton} aria-busy="true" />}
      {isError && (
        <button type="button" className="button-secondary" onClick={() => void refetch()}>
          Couldn't load settings · Try again
        </button>
      )}
      {data && <AIProviderForm view={data} />}
      {/* 앱 버전은 설정 화면에서만 보인다 */}
      <p className={styles.appInfo}>{appInfo ? `Blink v${appInfo.version}` : ''}</p>
    </section>
  );
}

function AIProviderForm({ view }: { view: ProviderSettingsView }) {
  const initial = view.providers.find((p) => p.isActive) ?? view.providers.find((p) => p.models.length > 0)!;
  const [provider, setProvider] = useState<ProviderId>(initial.provider);
  const entry = view.providers.find((p) => p.provider === provider)!;
  const [model, setModel] = useState(entry.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl ?? '');
  const [testResult, setTestResult] = useState<TestProviderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProvider();
  const test = useTestProvider();

  const selectedModel = entry.models.find((m) => m.id === model);
  const trimmedKey = apiKey.trim();
  const trimmedBaseUrl = baseUrl.trim();

  const selectProvider = (next: ProviderId) => {
    const nextEntry = view.providers.find((p) => p.provider === next)!;
    setProvider(next);
    setModel(nextEntry.model ?? '');
    setBaseUrl(nextEntry.baseUrl ?? '');
    setTestResult(null);
    setError(null);
  };

  const onTest = () => {
    setError(null);
    setTestResult(null);
    test.mutate(
      { provider, model, apiKey: trimmedKey || undefined, baseUrl: trimmedBaseUrl || undefined },
      {
        onSuccess: setTestResult,
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    update.mutate(
      {
        provider,
        model,
        apiKey: trimmedKey || undefined,
        baseUrl: trimmedBaseUrl ? trimmedBaseUrl : entry.baseUrl ? null : undefined,
      },
      {
        onSuccess: () => {
          setApiKey(''); // 평문 Key를 화면 상태에 남기지 않는다
          toast.show('AI settings saved');
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <form aria-label="AI settings" className={styles.form} onSubmit={onSubmit}>
      {!view.secureStorageAvailable && (
        <div role="alert" className={styles.warning}>
          <ShieldAlert size={16} strokeWidth={1.75} aria-hidden />Secure storage isn't available on this computer, so the API key can't be saved.
        </div>
      )}

      <label className={styles.field}>
        <span>Provider</span>
        <select aria-label="Provider" value={provider} onChange={(e) => selectProvider(e.target.value as ProviderId)}>
          {view.providers.map((p) => (
            <option key={p.provider} value={p.provider} disabled={p.models.length === 0}>
              {p.label}
              {p.models.length === 0 ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>API Key</span>
        <div className={styles.inputWithIcon}>
          <KeyRound size={16} strokeWidth={1.75} aria-hidden />
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={!view.secureStorageAvailable}
            placeholder={entry.hasApiKey ? 'Saved · enter a new key to replace it' : 'sk-...'}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </label>

      <label className={styles.field}>
        <span>Model</span>
        <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="" disabled>
            Choose a model
          </option>
          {entry.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {selectedModel && (
        <ul className={styles.capabilities} aria-label="Model capabilities">
          {CAPABILITY_ROWS.map((row) => {
            const supported = selectedModel.capabilities[row.key];
            return (
              <li key={row.key} data-supported={supported}>
                {supported ? <Check size={14} strokeWidth={2} aria-hidden /> : <X size={14} strokeWidth={2} aria-hidden />}
                {row.label}
                <span className={styles.enables}>
                  {row.enables} {supported ? 'available' : 'unavailable'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <details className={styles.advanced} open={Boolean(entry.baseUrl)}>
        <summary>Advanced</summary>
        <label className={styles.field}>
          <span>Base URL (optional)</span>
          <input
            type="url"
            value={baseUrl}
            placeholder={DEFAULT_BASE_URL_HINT[provider]}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
      </details>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {testResult && (
        <p className={styles.testResult} data-ok={testResult.ok}>
          {testResult.ok ? 'Connected' : CONNECTION_FAILURE_MESSAGE[testResult.failure.code]}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="button-secondary"
          disabled={!model || test.isPending || (!trimmedKey && !entry.hasApiKey)}
          onClick={onTest}
        >
          {test.isPending ? 'Checking…' : 'Test connection'}
        </button>
        <button type="submit" className="button-primary" disabled={!model || update.isPending || (!trimmedKey && !entry.hasApiKey)}>
          Save
        </button>
      </div>
    </form>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof BlinkIpcError) return FIELD_ERROR[error.code] ?? 'Couldn\'t save';
  return 'Couldn\'t save';
}

/** 사이드바 ⚙·AI 메뉴의 «설정 필요»에서 지금 화면 위로 연다 (주소에 ?settings). */
export function SettingsModal({ onClose }: { onClose(): void }) {
  return (
    <Modal title="AI settings" onClose={onClose}>
      <SettingsPanel />
    </Modal>
  );
}
