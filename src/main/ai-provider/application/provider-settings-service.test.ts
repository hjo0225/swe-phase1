import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../note/testing';
import { DrizzleAIProviderSettingsRepository } from '../infrastructure/drizzle-ai-provider-settings-repository';
import { FakeCipher, FakeFactory, fakeProvider } from '../testing';
import { ActiveLLM } from './active-llm';
import { ProviderError } from './ports';
import { ProviderSettingsService } from './provider-settings-service';

describe('ProviderSettingsService', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let repo: DrizzleAIProviderSettingsRepository;
  let cipher: FakeCipher;
  let factory: FakeFactory;
  let service: ProviderSettingsService;

  beforeEach(() => {
    database = createTestDatabase();
    repo = new DrizzleAIProviderSettingsRepository(database.db);
    cipher = new FakeCipher();
    factory = new FakeFactory();
    service = new ProviderSettingsService(repo, cipher, factory, { now: () => new Date(0) });
  });
  afterEach(() => database.close());

  it('describes empty settings with the model catalog', () => {
    const view = service.get();
    expect(view.active).toBeNull();
    expect(view.secureStorageAvailable).toBe(true);
    expect(view.providers.map((p) => [p.provider, p.hasApiKey, p.models.length])).toEqual([
      ['openai', false, 2],
      ['kimi', false, 0],
    ]);
  });

  it('stores the key encrypted, activates the provider, and never returns the key', () => {
    const view = service.update({ provider: 'openai', model: 'full-model', apiKey: '  sk-secret  ' });
    expect(view.active).toEqual({
      provider: 'openai',
      model: 'full-model',
      capabilities: { generate: true, structuredOutput: true, webSearch: true },
    });
    expect(JSON.stringify(view)).not.toContain('sk-secret');
    const stored = database.sqlite.prepare('SELECT encrypted_api_key FROM ai_provider_settings').pluck().get() as Buffer;
    expect(stored.toString()).toBe('terces-ks');
  });

  it('refuses to store a key without secure storage but still allows model changes', () => {
    service.update({ provider: 'openai', model: 'full-model', apiKey: 'sk' });
    cipher.available = false;
    expect(() => service.update({ provider: 'openai', model: 'text-model', apiKey: 'sk2' })).toThrow(
      expect.objectContaining({ code: 'PROVIDER_SECURE_STORAGE_UNAVAILABLE' }),
    );
    expect(service.update({ provider: 'openai', model: 'text-model' }).active?.model).toBe('text-model');
  });

  describe('test connection', () => {
    it('uses the draft key when given, otherwise the stored key, and saves nothing', async () => {
      await expect(service.test({ provider: 'openai', model: 'full-model', apiKey: 'draft' })).resolves.toEqual({ ok: true });
      expect(factory.created.at(-1)?.apiKey).toBe('draft');
      expect(service.get().active).toBeNull();

      service.update({ provider: 'openai', model: 'full-model', apiKey: 'stored' });
      await service.test({ provider: 'openai', model: 'full-model' });
      expect(factory.created.at(-1)?.apiKey).toBe('stored');
    });

    it('requires some key', async () => {
      await expect(service.test({ provider: 'openai', model: 'full-model' })).rejects.toMatchObject({
        code: 'PROVIDER_API_KEY_REQUIRED',
      });
    });

    it('reports provider failures as results, not errors', async () => {
      factory.provider = fakeProvider({
        testConnection: () => Promise.reject(new ProviderError('AUTH', '401')),
      });
      await expect(service.test({ provider: 'openai', model: 'full-model', apiKey: 'bad' })).resolves.toEqual({
        ok: false,
        failure: { code: 'AUTH_FAILED' },
      });
    });
  });
});

describe('ActiveLLM', () => {
  let database: ReturnType<typeof createTestDatabase>;
  beforeEach(() => {
    database = createTestDatabase();
  });
  afterEach(() => database.close());

  it('resolves the active model with capabilities and a decrypted client', () => {
    const repo = new DrizzleAIProviderSettingsRepository(database.db);
    const cipher = new FakeCipher();
    const factory = new FakeFactory();
    new ProviderSettingsService(repo, cipher, factory, { now: () => new Date(0) }).update({
      provider: 'openai',
      model: 'text-model',
      apiKey: 'sk',
    });
    const active = new ActiveLLM(repo, cipher, factory).resolve();
    expect(active.model).toBe('text-model');
    expect(active.capabilities.missing(['webSearch'])).toEqual(['webSearch']);
    expect(factory.created.at(-1)).toMatchObject({ provider: 'openai', apiKey: 'sk', model: 'text-model' });
  });

  it('is not configured without an active provider or when decryption fails', () => {
    const repo = new DrizzleAIProviderSettingsRepository(database.db);
    const cipher = new FakeCipher();
    const active = new ActiveLLM(repo, cipher, new FakeFactory());
    expect(active.tryResolve()).toBeNull();
    expect(() => active.resolve()).toThrow(expect.objectContaining({ code: 'AI_PROVIDER_NOT_CONFIGURED' }));

    new ProviderSettingsService(repo, cipher, new FakeFactory(), { now: () => new Date(0) }).update({
      provider: 'openai',
      model: 'full-model',
      apiKey: 'sk',
    });
    cipher.decrypt = () => {
      throw new Error('keychain changed');
    };
    expect(active.tryResolve()).toBeNull();
  });
});
