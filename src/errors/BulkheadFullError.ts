import { ResilyError } from './ResilyError';

/** Concurrent or queued capacity exhausted. */
export class BulkheadFullError extends ResilyError {
  public readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    super(
      `Bulkhead is full — maximum concurrent executions (${maxConcurrent}) reached.`,
    );
    this.maxConcurrent = maxConcurrent;
  }
}
