import OpenAI from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import { ProviderError, type LLMProvider } from '../application/ports';
import { ModelCapabilities } from '../domain/model-capabilities';
import type { ModelDescriptor } from '../domain/model-catalog';
import { toProviderError } from './openai-provider';

export const KIMI_DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';

const all = new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: true });

/**
 * Kimi 모델 카탈로그 (BR-AIP-02). 웹 검색은 모델 기능이 아니라 공식 검색 API(/v1/tools/search)로 하므로 모든 모델이 구체화를 지원한다.
 * moonshot-v1 계열은 2026-08-31에 종료되었다.
 */
export const KIMI_MODELS: readonly ModelDescriptor[] = [
  { id: 'kimi-k2.6', label: 'Kimi K2.6 (recommended)', capabilities: all },
  { id: 'kimi-k3', label: 'Kimi K3', capabilities: all },
];

/** thinking 스위치를 받는 모델. 나머지(k3 등)는 항상 추론해 파라미터를 보내면 안 된다. */
const THINKING_SWITCHABLE = new Set(['kimi-k2.6']);
const SEARCH_LIMIT = 5;
const SEARCH_QUERY_MAX = 200;
const SEARCH_TIMEOUT_SECONDS = 30;

interface KimiProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** 테스트에서 HTTP를 대체한다 */
  fetch?: typeof globalThis.fetch;
}

interface SearchResponse {
  search_results?: { title?: string; url?: string; snippet?: string }[];
}

/**
 * Kimi(Moonshot) 어댑터. OpenAI 호환 Chat Completions를 OpenAI SDK로 호출한다 (docs/backend/ai-provider/application-flows.md).
 * 구체화의 웹 검색은 공식 검색 API로 먼저 찾고, 그 결과만 근거로 다시 쓰게 한다 — 결과가 곧 출처다.
 */
export class KimiProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: KimiProviderConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? KIMI_DEFAULT_BASE_URL,
      fetch: config.fetch,
      maxRetries: 1,
    });
  }

  async embed(_request: { inputs: string[]; signal: AbortSignal }): Promise<number[][]> {
    throw new ProviderError('UNSUPPORTED', 'Kimi embeddings are not supported');
  }

  async testConnection(signal: AbortSignal): Promise<void> {
    const models = await this.call(() => this.client.models.list({ signal }));
    if (!models.data.some((m) => m.id === this.model)) {
      throw new ProviderError('MODEL_NOT_FOUND', 'Model is not available for this key');
    }
  }

  async generateText({ system, user, signal }: { system: string; user: string; signal: AbortSignal }): Promise<string> {
    return contentOf(await this.chat(system, user, {}, signal));
  }

  async generateStructured(request: {
    system: string;
    user: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<unknown> {
    const completion = await this.chat(
      request.system,
      request.user,
      {
        response_format: {
          type: 'json_schema',
          json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
        },
      },
      request.signal,
    );
    try {
      return JSON.parse(contentOf(completion)) as unknown;
    } catch {
      throw new ProviderError('BAD_RESPONSE', 'Structured output was not valid JSON');
    }
  }

  async researchAndGenerate({
    system,
    user,
    signal,
  }: {
    system: string;
    user: string;
    signal: AbortSignal;
  }): Promise<{ text: string; sources: { title: string; url: string }[] }> {
    const query = user.replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX);
    const response = await this.call(() =>
      this.client.post<SearchResponse>('/tools/search', {
        body: { text_query: query, limit: SEARCH_LIMIT, timeout_seconds: SEARCH_TIMEOUT_SECONDS },
        signal,
      }),
    );
    const results = (response.search_results ?? []).filter(
      (r): r is { title?: string; url: string; snippet?: string } => typeof r.url === 'string' && r.url.startsWith('http'),
    );
    if (results.length === 0) throw new ProviderError('BAD_RESPONSE', 'Web search returned no results');

    const grounded = [
      user,
      '',
      'Web search results (only write what these results confirm):',
      ...results.map((r, i) => `[${i + 1}] ${r.title ?? r.url}\n${r.url}\n${r.snippet ?? ''}`.trimEnd()),
    ].join('\n');
    const text = contentOf(await this.chat(system, grounded, {}, signal));
    return { text, sources: results.map((r) => ({ title: r.title?.trim() || r.url, url: r.url })) };
  }

  private chat(system: string, user: string, extra: Record<string, unknown>, signal: AbortSignal): Promise<ChatCompletion> {
    // `thinking`은 Kimi 확장 파라미터라 SDK 타입에 없다. 노트 작업은 빠른 응답이 중요해 끌 수 있는 모델에서는 끈다.
    const body = {
      model: this.model,
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ],
      ...(THINKING_SWITCHABLE.has(this.model) ? { thinking: { type: 'disabled' } } : {}),
      ...extra,
    };
    return this.call(() =>
      this.client.chat.completions.create(body as OpenAI.ChatCompletionCreateParamsNonStreaming, { signal }),
    );
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

function contentOf(completion: ChatCompletion): string {
  const content = completion.choices[0]?.message.content;
  if (typeof content !== 'string' || content.trim() === '') throw new ProviderError('BAD_RESPONSE', 'Empty response');
  return content;
}
