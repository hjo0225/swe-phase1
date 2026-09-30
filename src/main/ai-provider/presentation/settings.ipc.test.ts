import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../note/testing';
import { ProviderSettingsService } from '../application/provider-settings-service';
import { DrizzleAIProviderSettingsRepository } from '../infrastructure/drizzle-ai-provider-settings-repository';
import { FakeCipher, FakeFactory } from '../testing';
import { settingsIpcHandlers } from './settings.ipc';

describe('settingsIpcHandlers', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let handlers: ReturnType<typeof settingsIpcHandlers>;

  beforeEach(() => {
    database = createTestDatabase();
    handlers = settingsIpcHandlers(
      new ProviderSettingsService(
        new DrizzleAIProviderSettingsRepository(database.db),
        new FakeCipher(),
        new FakeFactory(),
        { now: () => new Date(0) },
      ),
    );
  });
  afterEach(() => database.close());

  const call = (channel: string, request: unknown) => handlers[channel]!(request);

  it('exposes the settings channels', () => {
    expect(Object.keys(handlers).sort()).toEqual(['settings:get-provider', 'settings:test-provider', 'settings:update-provider']);
  });

  it('rejects an empty api key and unknown providers at the transport boundary', async () => {
    await expect(call('settings:update-provider', { provider: 'openai', model: 'full-model', apiKey: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(call('settings:update-provider', { provider: 'gemini', model: 'x', apiKey: 'k' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('saves and reads back through envelopes', async () => {
    await call('settings:update-provider', { provider: 'openai', model: 'full-model', apiKey: 'sk-1' });
    const view = await call('settings:get-provider', {});
    expect(view).toMatchObject({ ok: true, data: { active: { provider: 'openai', model: 'full-model' } } });
    expect(JSON.stringify(view)).not.toContain('sk-1');
  });

  it('maps domain errors', async () => {
    await expect(call('settings:update-provider', { provider: 'openai', model: 'nope', apiKey: 'k' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROVIDER_MODEL_NOT_SUPPORTED' },
    });
    await expect(call('settings:test-provider', { provider: 'openai', model: 'full-model' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROVIDER_API_KEY_REQUIRED' },
    });
  });
});
