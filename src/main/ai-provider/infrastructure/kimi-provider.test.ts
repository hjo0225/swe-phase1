import { describe, expect, it } from 'vitest';
import { ProviderError } from '../application/ports';
import { KIMI_DEFAULT_BASE_URL, KIMI_MODELS, KimiProvider } from './kimi-provider';

type Captured = { url: string; body: Record<string, unknown> | undefined; auth: string | null };

/** 경로별 응답을 돌려주는 가짜 HTTP. */
function fakeFetch(routes: Record<string, { status: number; payload: unknown }>) {
  const calls: Captured[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
      auth: headers.get('authorization'),
    });
    const route = Object.entries(routes).find(([path]) => url.endsWith(path))?.[1] ?? { status: 404, payload: {} };
    return new Response(JSON.stringify(route.payload), {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const completion = (content: string) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'kimi-k2.6',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
});

const signal = new AbortController().signal;
const make = (fetch: typeof globalThis.fetch, model = 'kimi-k2.6', baseUrl?: string) =>
  new KimiProvider({ apiKey: 'sk-kimi', model, baseUrl, fetch });

describe('KimiProvider', () => {
  it('offers Kimi models that can do every Blink task (search goes through the tools API)', () => {
    expect(KIMI_MODELS.map((m) => m.id)).toEqual(['kimi-k2.6', 'kimi-k3']);
    for (const model of KIMI_MODELS) expect(model.capabilities.toJSON()).toEqual({ generate: true, structuredOutput: true, webSearch: true });
  });

  it('generates text through Chat Completions at the Moonshot base URL, with thinking off for k2.6', async () => {
    const { fetch, calls } = fakeFetch({ '/chat/completions': { status: 200, payload: completion('## 정리됨') } });
    await expect(make(fetch).generateText({ system: 'SYS', user: 'USER', signal })).resolves.toBe('## 정리됨');
    expect(calls[0]).toMatchObject({
      url: `${KIMI_DEFAULT_BASE_URL}/chat/completions`,
      auth: 'Bearer sk-kimi',
      body: {
        model: 'kimi-k2.6',
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'USER' },
        ],
        thinking: { type: 'disabled' },
      },
    });
  });

  it('does not send the thinking switch to models that always think', async () => {
    const { fetch, calls } = fakeFetch({ '/chat/completions': { status: 200, payload: completion('ok') } });
    await make(fetch, 'kimi-k3').generateText({ system: 'S', user: 'U', signal });
    expect(calls[0]!.body).not.toHaveProperty('thinking');
  });

  it('uses a custom base URL (e.g. the China endpoint)', async () => {
    const { fetch, calls } = fakeFetch({ '/chat/completions': { status: 200, payload: completion('ok') } });
    await make(fetch, 'kimi-k2.6', 'https://api.moonshot.cn/v1').generateText({ system: 'S', user: 'U', signal });
    expect(calls[0]!.url).toBe('https://api.moonshot.cn/v1/chat/completions');
  });

  it('requests a strict json_schema and parses the content', async () => {
    const { fetch, calls } = fakeFetch({ '/chat/completions': { status: 200, payload: completion('{"type":"process"}') } });
    const result = await make(fetch).generateStructured({
      system: 'S',
      user: 'U',
      schemaName: 'infographic',
      jsonSchema: { type: 'object' },
      signal,
    });
    expect(result).toEqual({ type: 'process' });
    expect(calls[0]!.body).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { name: 'infographic', strict: true, schema: { type: 'object' } } },
    });
  });

  it('reports non-JSON structured output as BAD_RESPONSE', async () => {
    const { fetch } = fakeFetch({ '/chat/completions': { status: 200, payload: completion('not json') } });
    await expect(
      make(fetch).generateStructured({ system: 'S', user: 'U', schemaName: 'x', jsonSchema: {}, signal }),
    ).rejects.toMatchObject({ kind: 'BAD_RESPONSE' });
  });

  it('searches with the tools API, grounds the answer on the results and returns them as sources', async () => {
    const { fetch, calls } = fakeFetch({
      '/tools/search': {
        status: 200,
        payload: {
          search_results: [
            { title: 'Electron Docs', url: 'https://electronjs.org/docs', snippet: 'Main and renderer processes' },
            { title: 'MDN', url: 'https://developer.mozilla.org/', snippet: 'Web APIs' },
          ],
        },
      },
      '/chat/completions': { status: 200, payload: completion('Electron은 Main과 Renderer 프로세스로 나뉜다.') },
    });

    const result = await make(fetch).researchAndGenerate({ system: 'SYS', user: '  Electron   구조  ', signal });

    expect(calls[0]).toMatchObject({
      url: `${KIMI_DEFAULT_BASE_URL}/tools/search`,
      auth: 'Bearer sk-kimi',
      body: { text_query: 'Electron 구조', limit: 5 },
    });
    const userMessage = (calls[1]!.body!.messages as { role: string; content: string }[])[1]!.content;
    expect(userMessage).toContain('Electron   구조');
    expect(userMessage).toContain('[1] Electron Docs');
    expect(userMessage).toContain('https://electronjs.org/docs');
    expect(result).toEqual({
      text: 'Electron은 Main과 Renderer 프로세스로 나뉜다.',
      sources: [
        { title: 'Electron Docs', url: 'https://electronjs.org/docs' },
        { title: 'MDN', url: 'https://developer.mozilla.org/' },
      ],
    });
  });

  it('fails instead of writing unsourced text when the search finds nothing', async () => {
    const { fetch } = fakeFetch({ '/tools/search': { status: 200, payload: { search_results: [] } } });
    await expect(make(fetch).researchAndGenerate({ system: 'S', user: 'U', signal })).rejects.toMatchObject({
      kind: 'BAD_RESPONSE',
    });
  });

  it('maps HTTP failures to provider error kinds without leaking the key', async () => {
    for (const [status, kind] of [
      [401, 'AUTH'],
      [429, 'RATE_LIMIT'],
      [500, 'UNAVAILABLE'],
    ] as const) {
      const { fetch } = fakeFetch({ '/chat/completions': { status, payload: { error: { message: 'bad sk-kimi' } } } });
      const error = await make(fetch)
        .generateText({ system: 'S', user: 'U', signal })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ kind });
      expect((error as Error).message).not.toContain('sk-kimi');
    }
  });

  it('tests the connection by checking the model exists', async () => {
    const models = { object: 'list', data: [{ id: 'kimi-k2.6', object: 'model', created: 0, owned_by: 'moonshot' }] };
    const ok = fakeFetch({ '/models': { status: 200, payload: models } });
    await expect(make(ok.fetch).testConnection(signal)).resolves.toBeUndefined();
    const missing = fakeFetch({ '/models': { status: 200, payload: models } });
    await expect(make(missing.fetch, 'kimi-k3').testConnection(signal)).rejects.toMatchObject({ kind: 'MODEL_NOT_FOUND' });
  });

  it('does not support embeddings', async () => {
    const { fetch } = fakeFetch({});
    await expect(make(fetch).embed({ inputs: ['a'], signal })).rejects.toMatchObject({ kind: 'UNSUPPORTED' });
  });
});
