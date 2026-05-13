/**
 * Example 03 — orthogonal primitives stacked: limit concurrency (bulkhead), cap latency (timeout),
 * smooth transient spikes (retry), and isolate dependents (circuit breaker).
 *
 * Run: `npx ts-node examples/03-retry-timeout-bulkhead.ts`
 *
 * Why this order matters:
 * - CircuitBreaker is the outermost shell so *every* ingress attempt observes breaker state first.
 * - Bulkhead ensures we never exceed inventory DB pool slots even if callers retry fiercely.
 * - Retry handles short blips inside the TTL budget.
 * - Timeout trims hanging queries so retries can fire deterministically.
 */

import type { IRetryStrategy } from '../src/interfaces/IRetryStrategy';
import { CircuitBreaker } from '../src/core/CircuitBreaker';
import { Retry } from '../src/core/Retry';
import { Timeout } from '../src/core/Timeout';
import { Bulkhead } from '../src/core/Bulkhead';

/** Minimal exponential policy — tweak base/max to match SLA windows. */
class ExponentialBackoffStrategy implements IRetryStrategy {
  constructor(
    private readonly baseDelayMs: number,
    private readonly maxDelayMs: number,
  ) {}

  /** @inheritdoc */
  getDelay(attempt: number): number {
    const exp = this.baseDelayMs * 2 ** (attempt - 1);
    return Math.min(exp, this.maxDelayMs);
  }

  /** @inheritdoc */
  shouldRetry(_error: Error, _attempt: number): boolean {
    return true;
  }
}

async function fetchInventoryReservation(sku: string): Promise<number> {
  void sku;
  return 42;
}

async function main(): Promise<void> {
  const inventoryCircuit = new CircuitBreaker({
    name: 'inventoryService',
    timeoutMs: 8_000, // breaker-level watchdog — aligns with SLA budget.
  });

  const skuBulkhead = new Bulkhead({
    maxConcurrent: 8,
    maxQueueSize: 32,
  });

  const queryTimeout = new Timeout(750);

  const resilientReader = new Retry({
    maxAttempts: 4,
    strategy: new ExponentialBackoffStrategy(50, 1_500),
  });

  const stock = await inventoryCircuit.execute(async () =>
    skuBulkhead.execute(async () =>
      resilientReader.execute(async () =>
        queryTimeout.execute(async () => fetchInventoryReservation('premium-widget')),
      ),
    ),
  );

  console.log('Reserved quantity:', stock);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
