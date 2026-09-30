import { describe, expect, it } from 'vitest';
import { AIProviderSettings } from './ai-provider-settings';
import { normalizeBaseUrl } from './base-url';
import { ModelCapabilities } from './model-capabilities';
import { ModelCatalog } from './model-catalog';

const full = new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: true });
const noSearch = new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: false });
const catalog = new ModelCatalog({
  openai: [
    { id: 'big', label: 'Big', capabilities: full },
    { id: 'small', label: 'Small', capabilities: noSearch },
  ],
  kimi: [],
});
const key = (s: string) => new TextEncoder().encode(s);
const now = new Date(0);

describe('ModelCapabilities', () => {
  it('reports missing capabilities for a job type', () => {
    expect(noSearch.supportsAll(['generate'])).toBe(true);
    expect(noSearch.missing(['generate', 'webSearch'])).toEqual(['webSearch']);
  });
});

describe('ModelCatalog', () => {
  it('finds models per provider and rejects unknown ones', () => {
    expect(catalog.find('openai', 'big')?.label).toBe('Big');
    expect(catalog.find('kimi', 'big')).toBeNull();
    expect(() => catalog.require('openai', 'nope')).toThrow(expect.objectContaining({ code: 'PROVIDER_MODEL_NOT_SUPPORTED' }));
  });
});

describe('normalizeBaseUrl', () => {
  it('accepts https and local http, trimming trailing slashes', () => {
    expect(normalizeBaseUrl('https://proxy.example.com/v1/')).toBe('https://proxy.example.com/v1');
    expect(normalizeBaseUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(normalizeBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1');
  });

  it('rejects remote http and garbage', () => {
    for (const bad of ['http://proxy.example.com', 'ftp://x', 'not a url']) {
      expect(() => normalizeBaseUrl(bad)).toThrow(expect.objectContaining({ code: 'PROVIDER_BASE_URL_INVALID' }));
    }
  });
});

describe('AIProviderSettings', () => {
  it('starts with nothing active', () => {
    expect(AIProviderSettings.empty().active()).toBeNull();
  });

  it('requires an API key for a newly configured provider', () => {
    expect(() => AIProviderSettings.empty().configure({ provider: 'openai', model: 'big' }, catalog, now)).toThrow(
      expect.objectContaining({ code: 'PROVIDER_API_KEY_REQUIRED' }),
    );
  });

  it('activates the configured provider and keeps its key when only the model changes', () => {
    const settings = AIProviderSettings.empty();
    settings.configure({ provider: 'openai', model: 'big', encryptedApiKey: key('k1') }, catalog, now);
    settings.configure({ provider: 'openai', model: 'small' }, catalog, now);

    const active = settings.active();
    expect(active?.provider).toBe('openai');
    expect(active?.model).toBe('small');
    expect(active?.apiKey).toEqual(key('k1'));
  });

  it('rejects models outside the provider catalog', () => {
    expect(() =>
      AIProviderSettings.empty().configure({ provider: 'kimi', model: 'big', encryptedApiKey: key('k') }, catalog, now),
    ).toThrow(expect.objectContaining({ code: 'PROVIDER_MODEL_NOT_SUPPORTED' }));
  });

  it('sets, keeps, and resets the base URL', () => {
    const settings = AIProviderSettings.empty();
    settings.configure(
      { provider: 'openai', model: 'big', encryptedApiKey: key('k'), baseUrl: 'https://proxy.example.com/' },
      catalog,
      now,
    );
    expect(settings.active()?.baseUrl).toBe('https://proxy.example.com');
    settings.configure({ provider: 'openai', model: 'big' }, catalog, now);
    expect(settings.active()?.baseUrl).toBe('https://proxy.example.com');
    settings.configure({ provider: 'openai', model: 'big', baseUrl: null }, catalog, now);
    expect(settings.active()?.baseUrl).toBeNull();
  });
});
