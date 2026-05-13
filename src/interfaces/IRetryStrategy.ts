/**
 * Defines the contract for pluggable retry-delay logic.
 *
 * Implement this interface to provide a custom back-off algorithm
 * (e.g. exponential, jittered, constant).
 */
export interface IRetryStrategy {
  /**
   * Returns the delay in milliseconds before the next attempt.
   *
   * @param attempt - The 1-based attempt number (1 = first retry after initial failure).
   */
  getDelay(attempt: number): number;

  /**
   * Returns `true` if the error should trigger a retry.
   *
   * @param error - The error thrown by the most recent attempt.
   * @param attempt - The 1-based attempt number that just failed.
   */
  shouldRetry(error: Error, attempt: number): boolean;
}
