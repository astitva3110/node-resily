import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * How {@link CompositeFailureDetector} merges decisions from delegates.
 *
 * - `ANY` — treat as failure if **any** child reports failure (`isFailure`).
 *           Success uses `ANY` symmetrically (`isSuccess`): true if **any** child succeeds.
 * - `ALL` — failure only when **every** child reports failure; success only when **every** child succeeds.
 */
export type CompositeFailureMode = 'ANY' | 'ALL';

/**
 * Configuration for {@link CompositeFailureDetector}.
 */
export interface CompositeFailureDetectorConfig {
  /** Delegate detectors consulted in declaration order. */
  detectors: readonly IFailureDetector[];

  /** Boolean merge strategy for delegates. */
  mode: CompositeFailureMode;
}

/**
 * Combines multiple detectors using boolean `ANY` / `ALL` composition.
 */
export class CompositeFailureDetector implements IFailureDetector {
  private readonly detectors: readonly IFailureDetector[];

  private readonly mode: CompositeFailureMode;

  /**
   * @param config - Detector list plus merge semantics.
   */
  constructor(config: CompositeFailureDetectorConfig) {
    if (config.detectors.length === 0) {
      throw new RangeError('CompositeFailureDetector requires at least one delegate');
    }

    this.detectors = [...config.detectors];
    this.mode = config.mode;
  }

  /** @inheritdoc */
  isFailure(error: unknown): boolean {
    if (this.mode === 'ANY') {
      return this.detectors.some((d) => d.isFailure(error));
    }
    return this.detectors.every((d) => d.isFailure(error));
  }

  /** @inheritdoc */
  isSuccess(result: unknown): boolean {
    if (this.mode === 'ANY') {
      return this.detectors.some((d) => d.isSuccess(result));
    }
    return this.detectors.every((d) => d.isSuccess(result));
  }
}
