import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/** Options for {@link CustomFailureDetector}. */
export interface CustomFailureDetectorConfig {
  shouldFail: (error: unknown) => boolean;
  shouldSucceed?: (result: unknown) => boolean;
  name?: string;
}

/** Delegates to caller-supplied predicates. */
export class CustomFailureDetector implements IFailureDetector {
  private readonly shouldFail: (error: unknown) => boolean;

  private readonly shouldSucceed: (result: unknown) => boolean;

  readonly name?: string;

  /** Wires `shouldFail` / optional `shouldSucceed` / optional diagnostic `name`. */
  constructor(config: CustomFailureDetectorConfig) {
    this.shouldFail = config.shouldFail;
    this.shouldSucceed = config.shouldSucceed ?? trueFn;
    this.name = config.name;
  }

  /** Delegates to `shouldFail`. */
  isFailure(error: unknown): boolean {
    return this.shouldFail(error);
  }

  /** Delegates to `shouldSucceed`. */
  isSuccess(result: unknown): boolean {
    return this.shouldSucceed(result);
  }
}

function trueFn(_result: unknown): boolean {
  return true;
}
