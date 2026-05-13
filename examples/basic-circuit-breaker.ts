/**
 * Basic circuit breaker example.
 *
 * Run with:
 *   npx ts-node examples/basic-circuit-breaker.ts
 */

import {
  CircuitBreaker,
  ConsecutiveFailureBreakingStrategy,
  TimeBasedResetStrategy,
} from '../src';

const cb = new CircuitBreaker({
  name: 'example-service',
  breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
  resetStrategy: new TimeBasedResetStrategy(5_000),
});

async function callDownstream(): Promise<string> {
  // Simulate a flaky HTTP call.
  if (Math.random() < 0.6) throw new Error('Service unavailable');
  return 'OK';
}

async function main(): Promise<void> {
  for (let i = 1; i <= 10; i++) {
    try {
      const result = await cb.execute(callDownstream);
      console.log(`Call ${i}: ${result} (state=${cb.getState()})`);
    } catch (err) {
      console.error(`Call ${i}: FAILED — ${(err as Error).message} (state=${cb.getState()})`);
    }
  }
}

main().catch(console.error);
