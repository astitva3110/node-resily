import 'reflect-metadata';

import { Injectable } from '@nestjs/common';
import { ConsecutiveFailureBreakingStrategy } from '../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../../../src/strategies/reset/TimeBasedResetStrategy';
import { WithCircuitBreaker } from '../../../src/decorators/CircuitBreakerDecorator';
import { WithRetry } from '../../../src/decorators/RetryDecorator';
import { WithTimeout } from '../../../src/decorators/TimeoutDecorator';
import { CircuitOpenError } from '../../../src/errors/CircuitOpenError';
import { MaxRetriesExceededError } from '../../../src/errors/MaxRetriesExceededError';
import { TimeoutError } from '../../../src/errors/TimeoutError';

jest.mock('@nestjs/common', () => ({
  Injectable: (): ClassDecorator => () => {},
}));

describe('resilience method decorators', () => {
  describe('@WithCircuitBreaker', () => {
    it('returns the method result on success', async () => {
      @Injectable()
      class Svc {
        @WithCircuitBreaker({
          name: 'cb-success',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
          resetStrategy: new TimeBasedResetStrategy(3600_000),
        })
        async value(): Promise<number> {
          return 42;
        }
      }

      await expect(new Svc().value()).resolves.toBe(42);
    });

    it('throws CircuitOpenError on the next call after the circuit opens', async () => {
      @Injectable()
      class Svc {
        @WithCircuitBreaker({
          name: 'cb-trip',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
          resetStrategy: new TimeBasedResetStrategy(3600_000),
        })
        async fail(): Promise<void> {
          await Promise.reject(new Error('boom'));
        }
      }

      const svc = new Svc();
      await expect(svc.fail()).rejects.toThrow('boom');
      await expect(svc.fail()).rejects.toBeInstanceOf(CircuitOpenError);
    });

    it('uses fallback when the circuit rejects the call', async () => {
      @Injectable()
      class Svc {
        @WithCircuitBreaker({
          name: 'cb-fallback',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
          resetStrategy: new TimeBasedResetStrategy(3600_000),
          fallback: async () => 'degraded',
        })
        async fail(): Promise<string> {
          return Promise.reject(new Error('boom'));
        }
      }

      const svc = new Svc();
      await expect(svc.fail()).resolves.toBe('degraded');
      await expect(svc.fail()).resolves.toBe('degraded');
    });

    it('shares one CircuitBreaker across class instances of the same decorator', async () => {
      const longOpen = new TimeBasedResetStrategy(3600_000);

      @Injectable()
      class SharedCb {
        @WithCircuitBreaker({
          name: 'shared-per-class-cb',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
          resetStrategy: longOpen,
        })
        async fail(): Promise<void> {
          await Promise.reject(new Error('boom'));
        }
      }

      const instanceA = new SharedCb();
      const instanceB = new SharedCb();

      await expect(instanceA.fail()).rejects.toThrow('boom');
      await expect(instanceB.fail()).rejects.toBeInstanceOf(CircuitOpenError);
    });
  });

  describe('@WithRetry', () => {
    it('retries until the method succeeds and then returns', async () => {
      let calls = 0;

      @Injectable()
      class Svc {
        @WithRetry({ maxAttempts: 3 })
        async flaky(): Promise<string> {
          calls += 1;
          if (calls < 3) {
            await Promise.reject(new Error('transient'));
          }

          return 'ok';
        }
      }

      await expect(new Svc().flaky()).resolves.toBe('ok');
      expect(calls).toBe(3);
    });

    it('throws MaxRetriesExceededError when attempts are exhausted', async () => {
      @Injectable()
      class Svc {
        @WithRetry({ maxAttempts: 3 })
        async alwaysFails(): Promise<void> {
          await Promise.reject(new Error('still down'));
        }
      }

      await expect(new Svc().alwaysFails()).rejects.toBeInstanceOf(
        MaxRetriesExceededError,
      );
    });

    /*
     * @WithRetry shares one Retry instance per decorated method across all class instances
     * (consistent with @WithCircuitBreaker). However, Retry holds no cross-call state — each
     * execute() call gets a fresh attempt budget starting from maxAttempts. This is intentional
     * and correct behavior: two concurrent calls on different instances each get their full retry
     * budget independently. This differs from @WithCircuitBreaker where the CircuitBreaker DOES
     * hold cross-call state (failure counts, circuit state) — that is why instanceA tripping the
     * breaker affects instanceB, but instanceA exhausting retries does NOT affect instanceB's retry
     * budget.
     */
    it('shares Retry config but starts a fresh retry attempt budget on each execute (per call, not cumulative across instances)', async () => {
      @Injectable()
      class SharedRetry {
        public attempts = 0;

        @WithRetry({ maxAttempts: 2 })
        async flaky(): Promise<string> {
          this.attempts += 1;
          await Promise.reject(new Error('nope'));
          return '';
        }
      }

      const instanceA = new SharedRetry();
      await expect(instanceA.flaky()).rejects.toBeInstanceOf(MaxRetriesExceededError);
      expect(instanceA.attempts).toBe(2);

      const instanceB = new SharedRetry();
      await expect(instanceB.flaky()).rejects.toBeInstanceOf(MaxRetriesExceededError);
      expect(instanceB.attempts).toBe(2);
    });
  });

  describe('@WithTimeout', () => {
    it('throws TimeoutError when the method exceeds the configured duration', async () => {
      jest.useFakeTimers();

      @Injectable()
      class Svc {
        @WithTimeout(300)
        async slow(): Promise<string> {
          await new Promise<string>((resolve) => {
            setTimeout(() => resolve('late'), 500);
          });
          return 'late';
        }
      }

      try {
        const p = new Svc().slow();
        const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
        await jest.advanceTimersByTimeAsync(300);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('@WithCircuitBreaker + @WithRetry', () => {
    it('runs retries inside the breaker and aggregates outcomes toward opening', async () => {
      const longOpen = new TimeBasedResetStrategy(3600_000);

      @Injectable()
      class Svc {
        public invoked = 0;

        @WithCircuitBreaker({
          name: 'stacked',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
          resetStrategy: longOpen,
        })
        @WithRetry({ maxAttempts: 2 })
        async work(): Promise<void> {
          this.invoked += 1;
          await Promise.reject(new Error('nope'));
        }
      }

      const a = new Svc();
      await expect(a.work()).rejects.toBeInstanceOf(MaxRetriesExceededError);
      expect(a.invoked).toBe(2);

      const b = new Svc();
      await expect(b.work()).rejects.toBeInstanceOf(MaxRetriesExceededError);
      expect(b.invoked).toBe(2);

      const third = new Svc();
      await expect(third.work()).rejects.toBeInstanceOf(CircuitOpenError);
      expect(third.invoked).toBe(0);
    });
  });
});
