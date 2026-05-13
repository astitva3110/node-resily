import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * `ANY`: failure if any child fails; success if any child accepts the result.
 * `ALL`: failure / success only when every child agrees.
 */
export type CompositeFailureMode = 'ANY' | 'ALL';

/** Options for {@link CompositeFailureDetector}. */
export interface CompositeFailureDetectorConfig {
  detectors: readonly IFailureDetector[];
  mode: CompositeFailureMode;
}

/** Composes child detectors with `ANY` or `ALL` boolean merge. */
export class CompositeFailureDetector implements IFailureDetector {
  private readonly detectors: readonly IFailureDetector[];

  private readonly mode: CompositeFailureMode;

  /** Requires at least one delegate and a merge mode. */
  constructor(config: CompositeFailureDetectorConfig) {
    if (config.detectors.length === 0) {
      throw new RangeError('CompositeFailureDetector requires at least one delegate');
    }

    this.detectors = [...config.detectors];
    this.mode = config.mode;
  }

  /** `ANY`: some; `ALL`: every — see {@link CompositeFailureMode}. */
  isFailure(error: unknown): boolean {
    if (this.mode === 'ANY') {
      return this.detectors.some((d) => d.isFailure(error));
    }
    return this.detectors.every((d) => d.isFailure(error));
  }

  /** Symmetric to `isFailure` for resolved payloads. */
  isSuccess(result: unknown): boolean {
    if (this.mode === 'ANY') {
      return this.detectors.some((d) => d.isSuccess(result));
    }
    return this.detectors.every((d) => d.isSuccess(result));
  }
}
