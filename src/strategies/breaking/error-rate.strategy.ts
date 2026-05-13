import type {
  BreakingStrategyContext,
  IBreakingStrategy,
} from '../../interfaces/IBreakingStrategy';

/** Thresholds for {@link ErrorRateBreakingStrategy}. */
export interface ErrorRateBreakingStrategyConfig {
  failureRateThreshold: number;
  minRequestCount: number;
}

/** Opens when rolling-window failure rate (0–100%) meets the threshold after `minRequestCount` calls. */
export class ErrorRateBreakingStrategy implements IBreakingStrategy {
  private readonly failureRateThreshold: number;

  private readonly minRequestCount: number;

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

  /** No-op; reads rolling stats via {@link BreakingStrategyContext.windowStats}. */
  afterInvoke(_durationMs: number): void {}

  /** Opens when rolling-window failure rate meets `failureRateThreshold` after enough samples. */
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

  /** No-op; window state lives on the breaker. */
  reset(): void {}
}
