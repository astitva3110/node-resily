import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/** `isFailure` always true (use when non-`Error` throws should still trip the breaker). */
export class AllErrorsFailureDetectionStrategy implements IFailureDetector {
  /** Classifies every thrown value as failure. */
  isFailure(_error: unknown): boolean {
    return true;
  }

  /** Classifies every resolved value as success. */
  isSuccess(_result: unknown): boolean {
    return true;
  }
}
