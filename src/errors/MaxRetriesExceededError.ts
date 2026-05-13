import { ResilyError } from './ResilyError';

/**
 * Thrown when all retry attempts have been exhausted without success.
 */
export class MaxRetriesExceededError extends ResilyError {
  /** Total number of attempts that were made (initial + retries). */
  public readonly attempts: number;

  /** The last error that caused the final attempt to fail. */
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(
      `Operation failed after ${attempts} attempt(s). Last error: ${lastError.message}`,
      { cause: lastError },
    );
    this.attempts = attempts;
    this.lastError = lastError;
  }
}
