/**
 * Defines the contract for pluggable failure detection for circuit breaking.
 *
 * Classifies thrown errors and successful return values so the breaker can
 * count failures and avoid treating benign HTTP statuses as successes.
 */
export interface IFailureDetector {
  /**
   * Returns `true` if the given value should be counted as a circuit-breaking failure.
   *
   * @param error - The error thrown by the protected operation (often an `Error`).
   */
  isFailure(error: unknown): boolean;

  /**
   * Returns `true` if a resolved value should be treated as a successful outcome
   * for circuit statistics and half-open probes.
   *
   * @param result - The value returned by the protected operation.
   */
  isSuccess(result: unknown): boolean;
}

/**
 * @deprecated Use {@link IFailureDetector} instead; the name reflects HTTP-style
 * success/failure classification beyond thrown errors.
 */
export type IFailureDetectionStrategy = IFailureDetector;
