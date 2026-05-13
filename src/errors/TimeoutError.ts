import { ResilyError } from './ResilyError';

/**
 * Thrown when a protected operation exceeds the configured timeout duration.
 */
export class TimeoutError extends ResilyError {
  /** The timeout limit in milliseconds that was exceeded. */
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms.`);
    this.timeoutMs = timeoutMs;
  }
}
