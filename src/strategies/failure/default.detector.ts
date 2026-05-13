import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/** `instanceof Error` fails; all resolved values succeed. */
export class DefaultFailureDetector implements IFailureDetector {
  /** True for `Error` instances. */
  isFailure(error: unknown): boolean {
    return error instanceof Error;
  }

  /** Always true unless a custom detector tightens success semantics. */
  isSuccess(_result: unknown): boolean {
    return true;
  }
}
