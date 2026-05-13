import { TimeoutError } from '../errors/TimeoutError';

/**
 * Wraps an async operation and rejects it if it takes longer than the
 * specified duration.
 *
 * @example
 * ```ts
 * const timeout = new Timeout(5_000);
 * const result = await timeout.execute(() => slowNetworkCall());
 * ```
 */
export class Timeout {
  private readonly timeoutMs: number;

  /**
   * @param timeoutMs - Maximum allowed duration in milliseconds.
   */
  constructor(timeoutMs: number) {
    if (timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive number');
    }
    this.timeoutMs = timeoutMs;
  }

  /**
   * Executes `action` and races it against the configured timeout.
   * Throws {@link TimeoutError} if the timeout fires first.
   *
   * @param action - Async factory to execute within the time limit.
   */
  execute<T>(action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(this.timeoutMs));
      }, this.timeoutMs);

      action().then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
