import type { ProviderId } from '../../../shared/ipc/ai-provider';
import { DomainError } from '../../platform/errors';
import type { ModelCapabilities } from './model-capabilities';

export interface ModelDescriptor {
  id: string;
  label: string;
  capabilities: ModelCapabilities;
}

/** (Provider, Model)별 Capability. 내용은 각 어댑터가 제공하고 bootstrap에서 합친다 (BR-AIP-02). */
export class ModelCatalog {
  constructor(private readonly entries: Record<ProviderId, readonly ModelDescriptor[]>) {}

  modelsOf(provider: ProviderId): readonly ModelDescriptor[] {
    return this.entries[provider];
  }

  find(provider: ProviderId, model: string): ModelDescriptor | null {
    return this.entries[provider].find((m) => m.id === model) ?? null;
  }

  require(provider: ProviderId, model: string): ModelDescriptor {
    const descriptor = this.find(provider, model);
    if (!descriptor) {
      throw new DomainError('PROVIDER_MODEL_NOT_SUPPORTED', `Model ${model} is not supported for ${provider}`);
    }
    return descriptor;
  }
}
