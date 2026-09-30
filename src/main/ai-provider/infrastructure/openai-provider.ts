import OpenAI, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { ProviderError, type LLMProvider } from '../application/ports';
import { ModelCapabilities } from '../domain/model-capabilities';
import type { ModelDescriptor } from '../domain/model-catalog';

const all = new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: true });
const noWebSearch = new ModelCapabilities({ generate: true, structuredOutput: true, webSearch: false });

/**
 * OpenAI 모델 카탈로그 (BR-AIP-02). 모델 라인업이 바뀌면 이 목록만 고친다.
 * webSearch는 Responses API의 web_search 도구를 쓸 수 있는 모델만 true로 둔다.
 */
export const OPENAI_MODELS: readonly ModelDescriptor[] = [
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (권장)', capabilities: all },
  { id: 'gpt-5.4', label: 'GPT-5.4', capabilities: all },
  { id: 'gpt-5.5', label: 'GPT-5.5', capabilities: all },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (구체화 미지원)', capabilities: noWebSearch },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capabilities: all },
];

interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** 테스트에서 HTTP를 대체한다 */
  fetch?: typeof globalThis.fetch;
}

/** Responses API 어댑터. SDK 예외는 ProviderError로만 바꿔 내보낸다(메시지에 요청·Key가 섞이지 않게). */
export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAIProviderConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      fetch: config.fetch,
      maxRetries: 1,
    });
  }

  async testConnection(signal: AbortSignal): Promise<void> {
    await this.call(() => this.client.models.retrieve(this.model, { signal }));
  }

  async generateText({ system, user, signal }: { system: string; user: string; signal: AbortSignal }): Promise<string> {
    const response = await this.call(() =>
      this.client.responses.create({ model: this.model, instructions: system, input: user }, { signal }),
    );
    return textOf(response);
  }

  async generateStructured(request: {
    system: string;
    user: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<unknown> {
    const response = await this.call(() =>
      this.client.responses.create(
        {
          model: this.model,
          instructions: request.system,
          input: request.user,
          text: { format: { type: 'json_schema', name: request.schemaName, schema: request.jsonSchema, strict: true } },
        },
        { signal: request.signal },
      ),
    );
    try {
      return JSON.parse(textOf(response)) as unknown;
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
    const response = await this.call(() =>
      this.client.responses.create(
        { model: this.model, instructions: system, input: user, tools: [{ type: 'web_search' }], tool_choice: 'required' },
        { signal },
      ),
    );
    const sources: { title: string; url: string }[] = [];
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type !== 'output_text') continue;
        for (const annotation of part.annotations) {
          if (annotation.type === 'url_citation') sources.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
    return { text: textOf(response), sources };
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

function textOf(response: OpenAIResponse): string {
  const text = response.output_text;
  if (typeof text !== 'string' || text.trim() === '') throw new ProviderError('BAD_RESPONSE', 'Empty response');
  return text;
}

/** SDK 예외 → ProviderError. OpenAI 호환 API(Kimi)도 같은 SDK를 써서 함께 쓴다. */
export function toProviderError(error: unknown): Error {
  if (error instanceof ProviderError || error instanceof APIUserAbortError) return error as Error;
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new ProviderError('AUTH', `Authentication failed (${error.status})`);
  }
  if (error instanceof NotFoundError) return new ProviderError('MODEL_NOT_FOUND', 'Model not found (404)');
  if (error instanceof RateLimitError) return new ProviderError('RATE_LIMIT', 'Rate limited (429)');
  if (error instanceof BadRequestError) return new ProviderError('UNSUPPORTED', 'Request rejected (400)');
  if (error instanceof APIConnectionError) return new ProviderError('UNAVAILABLE', 'Connection failed');
  if (error instanceof APIError) return new ProviderError('UNAVAILABLE', `Provider error (${String(error.status)})`);
  return new ProviderError('UNAVAILABLE', 'Unexpected provider failure');
}
