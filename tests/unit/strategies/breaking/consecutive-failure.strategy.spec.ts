import type { BreakingStrategyContext } from '../../../../src/interfaces/IBreakingStrategy';
import { ConsecutiveFailureBreakingStrategy } from '../../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';

function ctx(
  overrides: Partial<BreakingStrategyContext>,
): BreakingStrategyContext {
  return {
    consecutiveFailures: 0,
    countedAsBreakingFailure: true,
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

describe('ConsecutiveFailureBreakingStrategy', () => {
  it('rejects non-positive thresholds', () => {
    expect(() => new ConsecutiveFailureBreakingStrategy(0)).toThrow(RangeError);
    expect(() => new ConsecutiveFailureBreakingStrategy(-1)).toThrow(RangeError);
  });

  it('does not open before consecutive failures reach the threshold', () => {
    const s = new ConsecutiveFailureBreakingStrategy(3);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 0 }))).toBe(false);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 1 }))).toBe(false);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 2 }))).toBe(false);
  });

  it('opens at the threshold (not below) and remains open when failures exceed threshold', () => {
    const s = new ConsecutiveFailureBreakingStrategy(3);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 2 }))).toBe(false);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 3 }))).toBe(true);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 4 }))).toBe(true);
  });

  it('does not consider failures until the breaker counts them as breaking failures', () => {
    const s = new ConsecutiveFailureBreakingStrategy(3);
    expect(
      s.shouldOpen(
        ctx({ consecutiveFailures: 3, countedAsBreakingFailure: false }),
      ),
    ).toBe(false);
  });

  it('after reset(), sub-threshold context does not open until threshold is reached again', () => {
    const s = new ConsecutiveFailureBreakingStrategy(3);
    const atThreshold = ctx({ consecutiveFailures: 3 });
    expect(s.shouldOpen(atThreshold)).toBe(true);

    s.reset();

    expect(s.shouldOpen(ctx({ consecutiveFailures: 2 }))).toBe(false);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 3 }))).toBe(true);
  });

  it('afterInvoke does not throw and does not change shouldOpen for the same context', () => {
    const s = new ConsecutiveFailureBreakingStrategy(3);
    const context = ctx({ consecutiveFailures: 2 });

    expect(() => {
      s.afterInvoke(0);
      s.afterInvoke(100);
      s.afterInvoke(Number.MAX_SAFE_INTEGER);
    }).not.toThrow();

    expect(s.shouldOpen(context)).toBe(false);
    expect(s.shouldOpen(ctx({ consecutiveFailures: 3 }))).toBe(true);
  });
});
