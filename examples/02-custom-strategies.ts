/**
 * Example 02 — resily’s strategy model: swap breaking, reset, and failure detection without
 * forking the breaker core.
 *
 * Run: `npx ts-node examples/02-custom-strategies.ts`
 *
 * Why combine them: HTTP clients often return `{ status: 502 }` instead of throwing — the
 * HttpFailureDetector maps that into a breaker-visible failure. Rolling-window error-rate
 * breaking damps flap on noisy fleets, exponential reset spacing prevents retry storms,
 * and CompositeFailureDetector lets you fuse HTTP semantics with classic thrown errors.
 */

import { CircuitBreaker } from '../src/core/CircuitBreaker';
import { ErrorRateBreakingStrategy } from '../src/strategies/breaking/error-rate.strategy';
import { ConsecutiveFailureBreakingStrategy } from '../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';

import { ExponentialResetStrategy } from '../src/strategies/reset/exponential.strategy';

import { HttpFailureDetector } from '../src/strategies/failure/http.detector';
import { DefaultFailureDetector } from '../src/strategies/failure/default.detector';
import { CompositeFailureDetector } from '../src/strategies/failure/composite.detector';

async function main(): Promise<void> {
  const nuancedFailures = new CompositeFailureDetector({
    mode: 'ANY',
    detectors: [
      new HttpFailureDetector({
        ignoreStatusCodes: [404],
      }),
      new DefaultFailureDetector(),
    ],
  });

  const paymentService = new CircuitBreaker({
    name: 'paymentService',
    breakingStrategy: new ErrorRateBreakingStrategy({
      failureRateThreshold: 40,
      minRequestCount: 5,
    }),
    resetStrategy: new ExponentialResetStrategy({
      initialDelayMs: 250,
      multiplier: 2,
      maxDelayMs: 8_000,
    }),
    failureDetectionStrategy: nuancedFailures,
    windowMs: 15_000,
    bucketCount: 5,
  });

  paymentService.on('open', () =>
    console.warn('[paymentService] OPEN — shedding traffic while PSP recovers'),
  );

  // Simulate PSP instability: intermittent 502 envelopes (no thrown Error).
  for (let wave = 0; wave < 8; wave++) {
    await paymentService.execute(async () => ({
      ok: wave % 3 !== 0,
      statusCode: wave % 3 !== 0 ? 200 : 502,
      transactionId: `tx-${wave}`,
    }));
  }

  console.log('[paymentService] state:', paymentService.getState());
  console.log('[paymentService] window:', paymentService.getWindowStats());

  // Consecutive breaker for comparison — strict trip count, simpler mental model:
  const inventoryService = new CircuitBreaker({
    name: 'inventoryService',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
    failureDetectionStrategy: new HttpFailureDetector({ ignoreStatusCodes: [404] }),
  });

  inventoryService.on('open', () => console.warn('[inventoryService] OPEN'));

  for (let i = 0; i < 5; i++) {
    await inventoryService.execute(async () => ({
      status: i < 3 ? 503 : 200,
      sku: 'SKU-42',
    }));
  }

  console.log('[inventoryService] state:', inventoryService.getState());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
