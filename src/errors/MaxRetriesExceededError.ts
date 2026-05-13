import { ResilyError } from './ResilyError';

/** All retry attempts failed. */
export class MaxRetriesExceededError extends ResilyError {
  public readonly attempts: number;

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
