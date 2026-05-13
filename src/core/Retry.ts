import { MaxRetriesExceededError } from '../errors/MaxRetriesExceededError';
import type { IRetryStrategy } from '../interfaces/IRetryStrategy';

/** Options for constructing a {@link Retry} executor. */
export interface RetryOptions {
  /** Maximum number of retry attempts (not counting the initial call). */
  maxAttempts: number;
  /** Pluggable strategy controlling delay and whether to retry a given error. */
  strategy?: IRetryStrategy;
}

/** Default retry strategy: retry all errors with no delay. */
class DefaultRetryStrategy implements IRetryStrategy {
  getDelay(_attempt: number): number {
    return 0;
  }
  shouldRetry(_error: Error, attempt: number): boolean {
    return true;
  }
}

/**
 * Executes an async operation with configurable retry logic.
 *
 * @example
 * ```ts
 * const retry = new Retry({ maxAttempts: 3, strategy: new ExponentialBackoffStrategy() });
 * const data = await retry.execute(() => fetchRemoteData());
 * ```
 */
export class Retry {
  private readonly maxAttempts: number;
  private readonly strategy: IRetryStrategy;

  constructor(options: RetryOptions) {
    if (options.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be at least 1');
    }
    this.maxAttempts = options.maxAttempts;
    this.strategy = options.strategy ?? new DefaultRetryStrategy();
  }

  /**
   * Runs `action` up to `maxAttempts + 1` times (initial call + retries).
   * Throws {@link MaxRetriesExceededError} when all attempts are exhausted.
   *
   * @param action - Async factory to execute and potentially retry.
   */
  async execute<T>(action: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= this.maxAttempts + 1; attempt++) {
      try {
        return await action();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        const isLastAttempt = attempt > this.maxAttempts;
        if (isLastAttempt || !this.strategy.shouldRetry(lastError, attempt)) {
          break;
        }

        const delay = this.strategy.getDelay(attempt);
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    throw new MaxRetriesExceededError(this.maxAttempts + 1, lastError);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
