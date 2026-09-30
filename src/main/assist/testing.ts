import type { Capabilities } from '../../shared/assist/capabilities';
import type { AIJobView } from '../../shared/ipc/assist';
import type { ActiveModel } from '../ai-provider/application/active-llm';
import type { LLMProvider } from '../ai-provider/application/ports';
import { ModelCapabilities } from '../ai-provider/domain/model-capabilities';
import { fakeProvider } from '../ai-provider/testing';
import type { JobEventPublisher } from './application/ports';

/** 테스트 전용 도우미. */

export const allCapabilities: Capabilities = { generate: true, structuredOutput: true, webSearch: true };

export class FakeActiveLLM {
  capabilities: Capabilities = allCapabilities;
  configured = true;
  client: LLMProvider = fakeProvider();

  tryResolve(): ActiveModel | null {
    if (!this.configured) return null;
    return {
      provider: 'openai',
      model: 'test-model',
      capabilities: new ModelCapabilities(this.capabilities),
      client: this.client,
    };
  }

  resolve(): ActiveModel {
    const active = this.tryResolve();
    if (!active) throw Object.assign(new Error('not configured'), { code: 'AI_PROVIDER_NOT_CONFIGURED' });
    return active;
  }
}

export class RecordingPublisher implements JobEventPublisher {
  events: AIJobView[] = [];
  jobUpdated(view: AIJobView): void {
    this.events.push(view);
  }
  statuses(jobId: string): string[] {
    return this.events.filter((e) => e.id === jobId).map((e) => e.status);
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
