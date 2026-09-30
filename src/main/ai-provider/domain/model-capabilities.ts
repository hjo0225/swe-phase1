import type { Capabilities, Capability } from '../../../shared/assist/capabilities';

/** 모델이 지원하는 기능. 값은 모델 카탈로그가 정한다. */
export class ModelCapabilities {
  constructor(private readonly values: Capabilities) {}

  supportsAll(required: readonly Capability[]): boolean {
    return this.missing(required).length === 0;
  }

  missing(required: readonly Capability[]): Capability[] {
    return required.filter((c) => !this.values[c]);
  }

  toJSON(): Capabilities {
    return { ...this.values };
  }
}
