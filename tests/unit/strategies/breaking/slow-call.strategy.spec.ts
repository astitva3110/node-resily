import type { BreakingStrategyContext } from '../../../../src/interfaces/IBreakingStrategy';
import { SlowCallBreakingStrategy } from '../../../../src/strategies/breaking/slow-call.strategy';

function baseCtx(overrides: Partial<BreakingStrategyContext> = {}): BreakingStrategyContext {
  return {
    consecutiveFailures: 0,
    countedAsBreakingFailure: false,
    durationMs: 0,
    windowStats: {
      successes: 0,
      failures: 0,
      total: 0,
      errorRate: 0,
    },
    ...overrides,
  };
}

describe('SlowCallBreakingStrategy', () => {
  it('rejects invalid configuration', () => {
    expect(
      () =>
        new SlowCallBreakingStrategy({
          slowCallDurationThreshold: -1,
          slowCallRateThreshold: 50,
          minRequestCount: 1,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new SlowCallBreakingStrategy({
          slowCallDurationThreshold: 0,
          slowCallRateThreshold: 101,
          minRequestCount: 1,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new SlowCallBreakingStrategy({
          slowCallDurationThreshold: 0,
          slowCallRateThreshold: 50,
          minRequestCount: 0,
        }),
    ).toThrow(RangeError);
  });

  it('prunes durations after many invocations', () => {
    const s = new SlowCallBreakingStrategy({
      slowCallDurationThreshold: 0,
      slowCallRateThreshold: 100,
      minRequestCount: 1,
    });

    const store = s as unknown as { durations: number[] };

    for (let i = 0; i < 2050; i++) {
      s.afterInvoke(1);
    }

    expect(store.durations.length).toBeLessThanOrEqual(2048);
  });

  it('tracks slow calls correctly', () => {
    const s = new SlowCallBreakingStrategy({
      slowCallDurationThreshold: 100,
      slowCallRateThreshold: 50,
      minRequestCount: 2,
    });

    s.afterInvoke(50);
    s.afterInvoke(150);
    expect(s.shouldOpen(baseCtx())).toBe(true);
  });

  it('opens when slow call rate reaches the threshold', () => {
    const s = new SlowCallBreakingStrategy({
      slowCallDurationThreshold: 10,
      slowCallRateThreshold: 50,
      minRequestCount: 4,
    });

    s.afterInvoke(5);
    s.afterInvoke(5);
    s.afterInvoke(100);
    s.afterInvoke(100);

    expect(s.shouldOpen(baseCtx())).toBe(true);
  });

  it('does not open below minRequestCount', () => {
    const s = new SlowCallBreakingStrategy({
      slowCallDurationThreshold: 0,
      slowCallRateThreshold: 50,
      minRequestCount: 10,
    });

    for (let i = 0; i < 3; i++) {
      s.afterInvoke(5);
    }

    expect(s.shouldOpen(baseCtx())).toBe(false);
  });

  it('reset() clears durations', () => {
    const s = new SlowCallBreakingStrategy({
      slowCallDurationThreshold: 0,
      slowCallRateThreshold: 51,
      minRequestCount: 2,
    });

    s.afterInvoke(10);
    s.afterInvoke(20);
    s.reset();

    expect(s.shouldOpen(baseCtx())).toBe(false);
  });
});
