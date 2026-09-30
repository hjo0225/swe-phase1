import { DomainError } from '../../platform/errors';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** BR-AIP-04: https URL, 또는 로컬 프록시용 http://localhost. 끝의 `/`는 제거한다. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid(raw);
  }
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!allowed) throw invalid(raw);
  return url.toString().replace(/\/+$/, '');
}

const invalid = (raw: string) => new DomainError('PROVIDER_BASE_URL_INVALID', `Invalid base URL: ${raw}`);
