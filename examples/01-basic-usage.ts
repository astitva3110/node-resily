/**
 * Example 01 — foundational circuit breaker wiring.
 *
 * Run: `npx ts-node examples/01-basic-usage.ts`
 *
 * Why a circuit breaker here: payment calls are bursty; when the PSP is down we fail fast
 * instead of burning threads and cascading latency.
 */

import { CircuitBreaker } from '../src/core/CircuitBreaker';
import { ConsecutiveFailureBreakingStrategy } from '../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
async function chargePayment(): Promise<{ charged: boolean }> {
  return { charged: true };
}

async function main(): Promise<void> {
  // `name` flows into errors, logs, and future health registries — keep it stable.
  const paymentService = new CircuitBreaker({
    name: 'paymentService',
    timeoutMs: 5_000,
  });

  // Side-channel telemetry: production systems forward these to metrics.
  paymentService.on('success', (_result, ms) => {
    console.log(`[paymentService] success after ${ms}ms`);
  });

  paymentService.on('failure', (err, ms) => {
    console.warn(`[paymentService] failure after ${ms}ms: ${err.message}`);
  });

  paymentService.on('open', () => console.warn('[paymentService] OPEN — short-circuiting calls'));

  paymentService.on('close', () => console.log('[paymentService] CLOSED — healthy again'));

  // Happy path: guarded call completes and returns the PSP payload.
  let outcome = await paymentService.execute(() => chargePayment(), {
    fallback: async () =>
      // Fallback only runs when circuit is open / call throws / timeout — not on success.
      ({ charged: false, reason: 'cached-degraded-mode' as const }),
  });
  console.log('First charge:', outcome);

  // Demonstrate fallback without a real outage: trip the breaker programmatically.
  const strictBreaker = new CircuitBreaker({
    name: 'paymentServiceStrict',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
  });
  strictBreaker.on('open', () =>
    console.warn('[paymentServiceStrict] tripped — next call should use fallback'));

  await strictBreaker.execute(async () => {
    throw new Error('PSP unavailable');
  }).catch(() => {
    /* breaker records the failure — expected */
  });

  outcome = await strictBreaker.execute(() => chargePayment(), {
    fallback: async () => ({ charged: false, reason: 'circuit-open' }),
  });
  console.log('After trip (fallback path):', outcome);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
