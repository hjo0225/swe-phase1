import { describe, expect, it } from 'vitest';
import { ProviderError } from '../application/ports';
import { OpenAIProvider } from './openai-provider';

type Captured = { url: string; body: Record<string, unknown> | undefined; auth: string | null };

function fakeFetch(status: number, payload: unknown) {
  const calls: Captured[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
      auth: headers.get('authorization'),
    });
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const message = (text: string, annotations: unknown[] = []) => ({
  id: 'resp_1',
  object: 'response',
  created_at: 0,
  status: 'completed',
  model: 'gpt-test',
  output: [
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations }],
    },
  ],
});

const signal = new AbortController().signal;
const make = (fetch: typeof globalThis.fetch) =>
  new OpenAIProvider({ apiKey: 'sk-test', model: 'gpt-test', baseUrl: 'https://proxy.example.com/v1', fetch });

describe('OpenAIProvider', () => {
  it('generates text through the Responses API with instructions and input', async () => {
    const { fetch, calls } = fakeFetch(200, message('## 정리됨'));
    await expect(make(fetch).generateText({ system: 'SYS', user: 'USER', signal })).resolves.toBe('## 정리됨');
    expect(calls[0]).toMatchObject({
      url: 'https://proxy.example.com/v1/responses',
      auth: 'Bearer sk-test',
      body: { model: 'gpt-test', instructions: 'SYS', input: 'USER' },
    });
  });

  it('requests a strict JSON schema and parses the structured output', async () => {
    const { fetch, calls } = fakeFetch(200, message('{"type":"process"}'));
    const result = await make(fetch).generateStructured({
      system: 'S',
      user: 'U',
      schemaName: 'infographic',
      jsonSchema: { type: 'object' },
      signal,
    });
    expect(result).toEqual({ type: 'process' });
    expect(calls[0]?.body?.text).toEqual({
      format: { type: 'json_schema', name: 'infographic', schema: { type: 'object' }, strict: true },
    });
  });

  it('forces the native web search tool and collects url citations as sources', async () => {
    const { fetch, calls } = fakeFetch(
      200,
      message('Electron은 Chromium과 Node.js 기반이다.', [
        { type: 'url_citation', url: 'https://www.electronjs.org/docs', title: 'Electron Docs', start_index: 0, end_index: 5 },
        { type: 'url_citation', url: 'https://www.electronjs.org/docs', title: 'Electron Docs', start_index: 6, end_index: 9 },
      ]),
    );
    const result = await make(fetch).researchAndGenerate({ system: 'S', user: 'U', signal });
    expect(result.sources).toEqual([
      { title: 'Electron Docs', url: 'https://www.electronjs.org/docs' },
      { title: 'Electron Docs', url: 'https://www.electronjs.org/docs' },
    ]);
    expect(calls[0]?.body).toMatchObject({ tools: [{ type: 'web_search' }], tool_choice: 'required' });
  });

  it.each([
    [401, 'AUTH'],
    [403, 'AUTH'],
    [404, 'MODEL_NOT_FOUND'],
    [429, 'RATE_LIMIT'],
    [500, 'UNAVAILABLE'],
    [400, 'UNSUPPORTED'],
  ])('maps HTTP %i to ProviderError(%s) without leaking the key', async (status, kind) => {
    const { fetch } = fakeFetch(status, { error: { message: 'Incorrect API key provided: sk-test' } });
    const error = await make(fetch)
      .generateText({ system: 'S', user: 'U', signal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain('sk-test');
  });

  it('treats unparseable structured output as a bad response', async () => {
    const { fetch } = fakeFetch(200, message('not json'));
    await expect(
      make(fetch).generateStructured({ system: 'S', user: 'U', schemaName: 'x', jsonSchema: {}, signal }),
    ).rejects.toMatchObject({ kind: 'BAD_RESPONSE' });
  });

  it('tests the connection by retrieving the configured model', async () => {
    const { fetch, calls } = fakeFetch(200, { id: 'gpt-test', object: 'model', created: 0, owned_by: 'openai' });
    await make(fetch).testConnection(signal);
    expect(calls[0]?.url).toBe('https://proxy.example.com/v1/models/gpt-test');
  });

  it('embeds titles with the large embedding model in input order', async () => {
    const { fetch, calls } = fakeFetch(200, {
      object: 'list',
      model: 'text-embedding-3-large',
      data: [
        { object: 'embedding', index: 1, embedding: [0, 1] },
        { object: 'embedding', index: 0, embedding: [1, 0] },
      ],
      usage: { prompt_tokens: 2, total_tokens: 2 },
    });
    await expect(make(fetch).embed({ inputs: ['a', 'b'], signal })).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(calls[0]).toMatchObject({
      url: 'https://proxy.example.com/v1/embeddings',
      body: { model: 'text-embedding-3-large', input: ['a', 'b'], encoding_format: 'float' },
    });
  });
});
