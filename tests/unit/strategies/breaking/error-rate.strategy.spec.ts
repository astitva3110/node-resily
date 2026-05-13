import type { BreakingStrategyContext } from '../../../../src/interfaces/IBreakingStrategy';
import { ErrorRateBreakingStrategy } from '../../../../src/strategies/breaking/error-rate.strategy';

function ctx(
  overrides: Partial<BreakingStrategyContext>,
): BreakingStrategyContext {
  return {
    consecutiveFailures: 1,
    countedAsBreakingFailure: true,
    durationMs: 1,
    windowStats: {
      successes: 0,
      failures: 0,
      total: 0,
      errorRate: 0,
    },
    ...overrides,
  };
}

describe('ErrorRateBreakingStrategy', () => {
  it('rejects invalid configuration boundaries', () => {
    expect(
      () =>
        new ErrorRateBreakingStrategy({
          failureRateThreshold: -1,
          minRequestCount: 1,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new ErrorRateBreakingStrategy({
          failureRateThreshold: 101,
          minRequestCount: 1,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new ErrorRateBreakingStrategy({
          failureRateThreshold: 50,
          minRequestCount: 0,
        }),
    ).toThrow(RangeError);

    expect(
      () =>
        new ErrorRateBreakingStrategy({
          failureRateThreshold: 50,
          minRequestCount: 3.5,
        }),
    ).toThrow(RangeError);
  });

  it('does not open when below minRequestCount', () => {
    const s = new ErrorRateBreakingStrategy({
      failureRateThreshold: 50,
      minRequestCount: 5,
    });

    expect(
      s.shouldOpen(
        ctx({
          windowStats: {
            successes: 1,
            failures: 1,
            total: 2,
            errorRate: 0.5,
          },
          countedAsBreakingFailure: true,
        }),
      ),
    ).toBe(false);
  });

  it('opens when error rate reaches the threshold once min requests satisfied', () => {
    const s = new ErrorRateBreakingStrategy({
      failureRateThreshold: 40,
      minRequestCount: 5,
    });

    expect(
      s.shouldOpen(
        ctx({
          windowStats: {
            successes: 3,
            failures: 2,
            total: 5,
            errorRate: 0.4,
          },
          countedAsBreakingFailure: true,
        }),
      ),
    ).toBe(true);
  });

  it('does not open when error rate is below threshold', () => {
    const s = new ErrorRateBreakingStrategy({
      failureRateThreshold: 50,
      minRequestCount: 2,
    });

    expect(
      s.shouldOpen(
        ctx({
          windowStats: {
            successes: 4,
            failures: 1,
            total: 5,
            errorRate: 0.2,
          },
          countedAsBreakingFailure: true,
        }),
      ),
    ).toBe(false);
  });

  it('ignores evaluations when failure was not counted as breaking failure', () => {
    const s = new ErrorRateBreakingStrategy({
      failureRateThreshold: 0,
      minRequestCount: 1,
    });

    expect(
      s.shouldOpen(
        ctx({
          countedAsBreakingFailure: false,
          windowStats: {
            successes: 0,
            failures: 1,
            total: 1,
            errorRate: 1,
          },
        }),
      ),
    ).toBe(false);
  });

  it('reset() completes without throwing', () => {
    const s = new ErrorRateBreakingStrategy({
      failureRateThreshold: 10,
      minRequestCount: 1,
    });
    expect(() => s.reset()).not.toThrow();
  });
});
