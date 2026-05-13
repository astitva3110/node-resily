import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * Configuration for {@link CustomFailureDetector}.
 */
export interface CustomFailureDetectorConfig {
  /** Mandatory predicate that decides failures from thrown/primitive errors. */
  shouldFail: (error: unknown) => boolean;

  /** Optional resolver predicate for successful outcomes. Defaults to unconditional success. */
  shouldSucceed?: (result: unknown) => boolean;

  /** Friendly label for diagnostics. */
  name?: string;
}

/**
 * Thin delegation wrapper around arbitrary predicates supplied by callers.
 */
export class CustomFailureDetector implements IFailureDetector {
  private readonly shouldFail: (error: unknown) => boolean;

  private readonly shouldSucceed: (result: unknown) => boolean;

  readonly name?: string;

  /**
   * @param config - Delegate functions.
   */
  constructor(config: CustomFailureDetectorConfig) {
    this.shouldFail = config.shouldFail;
    this.shouldSucceed = config.shouldSucceed ?? trueFn;
    this.name = config.name;
  }

  /** @inheritdoc */
  isFailure(error: unknown): boolean {
    return this.shouldFail(error);
  }

  /** @inheritdoc */
  isSuccess(result: unknown): boolean {
    return this.shouldSucceed(result);
  }
}

function trueFn(_result: unknown): boolean {
  return true;
}
