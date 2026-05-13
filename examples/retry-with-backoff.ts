/**
 * Retry with custom exponential back-off strategy example.
 *
 * Run with:
 *   npx ts-node examples/retry-with-backoff.ts
 */

import { Retry } from '../src';
import type { IRetryStrategy } from '../src';

/** Simple exponential back-off: delay = base * 2^(attempt-1), capped at maxDelay. */
class ExponentialBackoffStrategy implements IRetryStrategy {
  constructor(
    private readonly baseMs = 100,
    private readonly maxMs = 5_000,
  ) {}

  getDelay(attempt: number): number {
    return Math.min(this.baseMs * 2 ** (attempt - 1), this.maxMs);
  }

  shouldRetry(_error: Error, attempt: number): boolean {
    return attempt <= 5;
  }
}

const retry = new Retry({
  maxAttempts: 4,
  strategy: new ExponentialBackoffStrategy(200),
});

let attemptCount = 0;

async function unstableApi(): Promise<string> {
  attemptCount++;
  console.log(`  Attempt ${attemptCount}…`);
  if (attemptCount < 3) throw new Error('Not ready');
  return 'Response data';
}

async function main(): Promise<void> {
  console.log('Starting retry sequence…');
  const result = await retry.execute(unstableApi);
  console.log(`Success: ${result}`);
}

main().catch(console.error);
