import { ResilyError } from './ResilyError';

/**
 * Thrown when the bulkhead's concurrent-execution or queue slot limit is reached.
 */
export class BulkheadFullError extends ResilyError {
  /** Maximum number of concurrent executions the bulkhead allows. */
  public readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    super(
      `Bulkhead is full — maximum concurrent executions (${maxConcurrent}) reached.`,
    );
    this.maxConcurrent = maxConcurrent;
  }
}
