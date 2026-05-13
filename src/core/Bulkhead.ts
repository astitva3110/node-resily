import { BulkheadFullError } from '../errors/BulkheadFullError';

/** Options for {@link Bulkhead}. */
export interface BulkheadOptions {
  maxConcurrent: number;
  maxQueueSize?: number;
}

/** Limits concurrency; excess work queues up to `maxQueueSize` or rejects with {@link BulkheadFullError}. */
export class Bulkhead {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private running = 0;
  private readonly queue: Array<() => void> = [];

  /** At least one concurrent slot; optional wait queue size (default 0 = fail fast when full). */
  constructor(options: BulkheadOptions) {
    if (options.maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be at least 1');
    }
    this.maxConcurrent = options.maxConcurrent;
    this.maxQueueSize = options.maxQueueSize ?? 0;
  }

  /** Runs when capacity allows, queues if configured, else {@link BulkheadFullError}. */
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

  /** In-flight executions right now. */
  getRunningCount(): number {
    return this.running;
  }

  /** Waiting callbacks when at `maxConcurrent`. */
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
