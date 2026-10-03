import { Check, KeyRound, ShieldAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Capabilities } from '../../../../shared/assist/capabilities';
import type { ProviderId, ProviderSettingsView, TestProviderResult } from '../../../../shared/ipc/ai-provider';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import { toast } from '../../../shared/ui/toast';
import { CONNECTION_FAILURE_MESSAGE } from '../../assist/model/messages';
import { useProviderSettings, useTestProvider, useUpdateProvider } from '../api/settings-queries';
import { AIStatusChip } from './AIStatusChip';
import styles from './SettingsPage.module.css';

/** 비워 두면 쓰는 주소. Kimi 중국 계정은 https://api.moonshot.cn/v1 을 적는다. */
const DEFAULT_BASE_URL_HINT: Record<ProviderId, string> = {
  openai: '기본값: https://api.openai.com/v1',
  kimi: '기본값: https://api.moonshot.ai/v1 (중국: api.moonshot.cn)',
};

const CAPABILITY_ROWS: { key: keyof Capabilities; label: string; enables: string }[] = [
  { key: 'generate', label: '텍스트 생성', enables: '정리' },
  { key: 'structuredOutput', label: '구조화 출력', enables: '시각화' },
  { key: 'webSearch', label: '웹 검색', enables: '구체화' },
];

const FIELD_ERROR: Partial<Record<string, string>> = {
  PROVIDER_API_KEY_REQUIRED: 'API Key를 입력하세요',
  PROVIDER_MODEL_NOT_SUPPORTED: '지원하지 않는 모델입니다',
  PROVIDER_BASE_URL_INVALID: 'https:// 주소(또는 http://localhost)를 입력하세요',
  PROVIDER_SECURE_STORAGE_UNAVAILABLE: '보안 저장소를 사용할 수 없어 Key를 저장하지 못했습니다',
};

/** UC-AIP-001~003 */
export function SettingsPage() {
  const { data, isPending, isError, refetch } = useProviderSettings();
  return (
    <section className={`paper ${styles.page}`}>
      <h1 className={styles.title}>AI 설정</h1>
      <p className={styles.lead}>사용할 AI Provider와 모델, 본인의 API Key를 설정합니다. Key는 이 PC의 보안 저장소에 암호화되어 저장됩니다.</p>
      {/* 지금 쓰는 AI는 설정 화면에서만 보여 준다 */}
      <div className={styles.current}>
        <span className={styles.currentLabel}>사용 중</span>
        <AIStatusChip />
      </div>
      {isPending && <div className={styles.skeleton} aria-busy="true" />}
      {isError && (
        <button type="button" className="button-secondary" onClick={() => void refetch()}>
          설정을 불러오지 못했습니다 · 다시 시도
        </button>
      )}
      {data && <AIProviderForm view={data} />}
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
          toast.show('AI 설정을 저장했습니다');
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <form aria-label="AI 설정" className={styles.form} onSubmit={onSubmit}>
      {!view.secureStorageAvailable && (
        <div role="alert" className={styles.warning}>
          <ShieldAlert size={16} strokeWidth={1.75} aria-hidden />이 PC에서는 보안 저장소를 사용할 수 없어 API Key를 저장할 수 없습니다.
        </div>
      )}

      <label className={styles.field}>
        <span>Provider</span>
        <select aria-label="Provider" value={provider} onChange={(e) => selectProvider(e.target.value as ProviderId)}>
          {view.providers.map((p) => (
            <option key={p.provider} value={p.provider} disabled={p.models.length === 0}>
              {p.label}
              {p.models.length === 0 ? ' (준비 중)' : ''}
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
            placeholder={entry.hasApiKey ? '저장됨 · 바꾸려면 새 Key 입력' : 'sk-...'}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </label>

      <label className={styles.field}>
        <span>모델</span>
        <select aria-label="모델" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="" disabled>
            모델 선택
          </option>
          {entry.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {selectedModel && (
        <ul className={styles.capabilities} aria-label="모델 기능">
          {CAPABILITY_ROWS.map((row) => {
            const supported = selectedModel.capabilities[row.key];
            return (
              <li key={row.key} data-supported={supported}>
                {supported ? <Check size={14} strokeWidth={2} aria-hidden /> : <X size={14} strokeWidth={2} aria-hidden />}
                {row.label}
                <span className={styles.enables}>
                  {row.enables} {supported ? '사용 가능' : '사용 불가'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <details className={styles.advanced} open={Boolean(entry.baseUrl)}>
        <summary>고급 설정</summary>
        <label className={styles.field}>
          <span>Base URL (선택)</span>
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
          {testResult.ok ? '연결되었습니다' : CONNECTION_FAILURE_MESSAGE[testResult.failure.code]}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="button-secondary"
          disabled={!model || test.isPending || (!trimmedKey && !entry.hasApiKey)}
          onClick={onTest}
        >
          {test.isPending ? '확인 중…' : '연결 테스트'}
        </button>
        <button type="submit" className="button-primary" disabled={!model || update.isPending || (!trimmedKey && !entry.hasApiKey)}>
          저장
        </button>
      </div>
    </form>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof BlinkIpcError) return FIELD_ERROR[error.code] ?? '저장하지 못했습니다';
  return '저장하지 못했습니다';
}
