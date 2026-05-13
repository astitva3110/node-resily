/** Delay and retry eligibility between attempts. */
export interface IRetryStrategy {
  /** Milliseconds to wait before the next retry (1-based attempt index). */
  getDelay(attempt: number): number;

  /** Whether to schedule another attempt after this failure. */
  shouldRetry(error: Error, attempt: number): boolean;
}
