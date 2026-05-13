import { CircuitBreaker } from '../../src/core/CircuitBreaker';
import { Retry } from '../../src/core/Retry';
import { ConsecutiveFailureBreakingStrategy } from '../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../../src/strategies/reset/TimeBasedResetStrategy';
import { CircuitOpenError } from '../../src/errors/CircuitOpenError';

/**
 * Integration test: CircuitBreaker wrapping a Retry.
 * Each retry attempt counts as a call through the circuit breaker.
 */
describe('CircuitBreaker + Retry integration', () => {
  it('opens the circuit when all retry attempts fail', async () => {
    const cb = new CircuitBreaker({
      name: 'integration-test',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
      resetStrategy: new TimeBasedResetStrategy(9999),
    });
    const retry = new Retry({ maxAttempts: 2 });

    const callThrough = () =>
      cb.execute(() => retry.execute(() => Promise.reject(new Error('down'))));

    // 3 outer calls × (1 initial + 2 retries) = 9 failures — circuit opens after 3.
    await expect(callThrough()).rejects.toThrow();
    await expect(callThrough()).rejects.toThrow();
    await expect(callThrough()).rejects.toThrow();

    // Circuit is now open — next call is rejected immediately.
    await expect(callThrough()).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
