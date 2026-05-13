import { BulkheadFullError } from '../errors/BulkheadFullError';

/** Options for constructing a {@link Bulkhead}. */
export interface BulkheadOptions {
  /** Maximum number of concurrently executing operations. */
  maxConcurrent: number;
  /**
   * Maximum number of operations that may wait in the queue while the
   * bulkhead is at capacity. Defaults to `0` (no queuing — reject immediately).
   */
  maxQueueSize?: number;
}

/**
 * Limits the number of concurrent executions to protect downstream resources.
 * Calls that exceed `maxConcurrent` are either queued (up to `maxQueueSize`)
 * or rejected immediately with a {@link BulkheadFullError}.
 *
 * @example
 * ```ts
 * const bulkhead = new Bulkhead({ maxConcurrent: 10, maxQueueSize: 20 });
 * const result = await bulkhead.execute(() => callDatabase());
 * ```
 */
export class Bulkhead {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(options: BulkheadOptions) {
    if (options.maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be at least 1');
    }
    this.maxConcurrent = options.maxConcurrent;
    this.maxQueueSize = options.maxQueueSize ?? 0;
  }

  /**
   * Executes `action` if a slot is available, or queues/rejects based on
   * the configured queue size.
   *
   * @param action - Async factory to execute within the bulkhead.
   */
  execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.running < this.maxConcurrent) {
      return this.run(action);
    }

    if (this.queue.length < this.maxQueueSize) {
      return new Promise<T>((resolve, reject) => {
        this.queue.push(() => {
          this.run(action).then(resolve, reject);
        });
      });
    }

    return Promise.reject(new BulkheadFullError(this.maxConcurrent));
  }

  /** Returns the number of currently active executions. */
  getRunningCount(): number {
    return this.running;
  }

  /** Returns the number of operations waiting in the queue. */
  getQueuedCount(): number {
    return this.queue.length;
  }

  private async run<T>(action: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      return await action();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}
