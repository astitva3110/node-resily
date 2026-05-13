import { ResilyError } from './ResilyError';

/** Action exceeded the configured time limit. */
export class TimeoutError extends ResilyError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms.`);
    this.timeoutMs = timeoutMs;
  }
}
