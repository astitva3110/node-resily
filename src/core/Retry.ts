import { MaxRetriesExceededError } from '../errors/MaxRetriesExceededError';
import type { IRetryStrategy } from '../interfaces/IRetryStrategy';

/** Options for {@link Retry}. */
export interface RetryOptions {
  maxAttempts: number;
  strategy?: IRetryStrategy;
}

class DefaultRetryStrategy implements IRetryStrategy {
  getDelay(_attempt: number): number {
    return 0;
  }
  shouldRetry(_error: Error, _attempt: number): boolean {
    return true;
  }
}

/** Retries an async factory with a pluggable {@link IRetryStrategy}. */
export class Retry {
  private readonly maxAttempts: number;
  private readonly strategy: IRetryStrategy;

  /** `maxAttempts` is the maximum number of times `action` may run (including the first try). */
  constructor(options: RetryOptions) {
    if (options.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be at least 1');
    }
    this.maxAttempts = options.maxAttempts;
    this.strategy = options.strategy ?? new DefaultRetryStrategy();
  }

  /** Runs `action` until success, {@link MaxRetriesExceededError}, or a non-retryable error. */
  async execute<T>(action: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await action();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt >= this.maxAttempts) {
          break;
        }

        if (!this.strategy.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        const delay = this.strategy.getDelay(attempt);
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    throw new MaxRetriesExceededError(this.maxAttempts, lastError);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
