import { TimeoutError } from '../errors/TimeoutError';

/** Races `action` against a fixed delay; throws {@link TimeoutError} if time elapses first. */
export class Timeout {
  private readonly timeoutMs: number;

  /** Positive duration in ms; invalid values throw {@link RangeError}. */
  constructor(timeoutMs: number) {
    if (timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive number');
    }
    this.timeoutMs = timeoutMs;
  }

  /** Rejects with {@link TimeoutError} if `action` does not settle in time. */
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
