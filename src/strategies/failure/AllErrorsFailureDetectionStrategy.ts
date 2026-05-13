import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * Failure detector that always classifies errors as counted failures (`isFailure` is always `true`)
 * and accepts every resolved payload as a success.
 *
 * @remarks
 * Use when you want permissive error matching (e.g. custom `Error` subtypes you still want counted)
 * unlike {@link DefaultFailureDetector}, which only returns `true` for `instanceof Error`.
 */
export class AllErrorsFailureDetectionStrategy implements IFailureDetector {
  /** @inheritdoc */
  isFailure(_error: unknown): boolean {
    return true;
  }

  /** @inheritdoc */
  isSuccess(_result: unknown): boolean {
    return true;
  }
}
