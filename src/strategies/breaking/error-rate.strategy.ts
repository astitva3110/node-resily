import type {
  BreakingStrategyContext,
  IBreakingStrategy,
} from '../../interfaces/IBreakingStrategy';

/**
 * Configuration for {@link ErrorRateBreakingStrategy}.
 */
export interface ErrorRateBreakingStrategyConfig {
  /**
   * Minimum percentage of failures in the rolling window (0–100) that opens the circuit
   * after enough requests exist (e.g. `50` means 50% or higher).
   */
  failureRateThreshold: number;

  /** Minimum recorded calls (successes + failures) in the window before evaluating. */
  minRequestCount: number;
}

/**
 * Opens the circuit when the rolling window error rate crosses a configured percentage,
 * optionally waiting until a minimum sample size exists.
 *
 * Rolling-window aggregates are maintained by {@link CircuitBreaker}; this strategy
 * only reads them via {@link BreakingStrategyContext.windowStats}.
 */
export class ErrorRateBreakingStrategy implements IBreakingStrategy {
  private readonly failureRateThreshold: number;

  private readonly minRequestCount: number;

  /**
   * @param config - Thresholds for error rate breaking.
   */
  constructor(config: ErrorRateBreakingStrategyConfig) {
    const { failureRateThreshold, minRequestCount } = config;

    if (failureRateThreshold < 0 || failureRateThreshold > 100) {
      throw new RangeError('failureRateThreshold must be between 0 and 100');
    }

    if (minRequestCount < 1 || !Number.isInteger(minRequestCount)) {
      throw new RangeError('minRequestCount must be a positive integer');
    }

    this.failureRateThreshold = failureRateThreshold;
    this.minRequestCount = minRequestCount;
  }

  /** @inheritdoc */
  afterInvoke(_durationMs: number): void {
    // Window stats live on the breaker — nothing to accumulate here.
  }

  /** @inheritdoc */
  shouldOpen(context: BreakingStrategyContext): boolean {
    if (!context.countedAsBreakingFailure) {
      return false;
    }

    const { total: totalRequests } = context.windowStats;
    if (totalRequests < this.minRequestCount) {
      return false;
    }

    const observedPercent = context.windowStats.errorRate * 100;
    return observedPercent >= this.failureRateThreshold;
  }

  /** @inheritdoc */
  reset(): void {
    // Stateless with respect to the rolling window maintained by the breaker.
  }
}
