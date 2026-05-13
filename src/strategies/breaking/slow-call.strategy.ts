import type {
  BreakingStrategyContext,
  IBreakingStrategy,
} from '../../interfaces/IBreakingStrategy';

/**
 * Configuration for {@link SlowCallBreakingStrategy}.
 */
export interface SlowCallBreakingStrategyConfig {
  /** Calls taking longer than this many milliseconds count as slow. */
  slowCallDurationThreshold: number;

  /**
   * Minimum percentage of tracked calls that must be slow (0–100) to open the circuit,
   * after {@link SlowCallBreakingStrategyConfig.minRequestCount} samples exist.
   */
  slowCallRateThreshold: number;

  /** Minimum number of sampled durations required before evaluating. */
  minRequestCount: number;
}

const MAX_DURATION_SAMPLES = 2_048;

/**
 * Tracks recent call durations locally and trips the circuit when too many calls
 * are slower than a configured threshold.
 */
export class SlowCallBreakingStrategy implements IBreakingStrategy {
  private readonly slowCallDurationThreshold: number;

  private readonly slowCallRateThreshold: number;

  private readonly minRequestCount: number;

  private readonly durations: number[] = [];

  /**
   * @param config - Latency and rate thresholds.
   */
  constructor(config: SlowCallBreakingStrategyConfig) {
    const {
      slowCallDurationThreshold,
      slowCallRateThreshold,
      minRequestCount,
    } = config;

    if (slowCallDurationThreshold < 0) {
      throw new RangeError('slowCallDurationThreshold must be non-negative');
    }

    if (slowCallRateThreshold < 0 || slowCallRateThreshold > 100) {
      throw new RangeError('slowCallRateThreshold must be between 0 and 100');
    }

    if (minRequestCount < 1 || !Number.isInteger(minRequestCount)) {
      throw new RangeError('minRequestCount must be a positive integer');
    }

    this.slowCallDurationThreshold = slowCallDurationThreshold;
    this.slowCallRateThreshold = slowCallRateThreshold;
    this.minRequestCount = minRequestCount;
  }

  /** @inheritdoc */
  afterInvoke(durationMs: number): void {
    this.durations.push(durationMs);
    if (this.durations.length > MAX_DURATION_SAMPLES) {
      this.durations.splice(0, this.durations.length - MAX_DURATION_SAMPLES);
    }
  }

  /** @inheritdoc */
  shouldOpen(_context: BreakingStrategyContext): boolean {
    if (this.durations.length < this.minRequestCount) {
      return false;
    }

    const slowCount = this.durations.filter(
      (ms) => ms > this.slowCallDurationThreshold,
    ).length;

    const slowPercent = (slowCount / this.durations.length) * 100;
    return slowPercent >= this.slowCallRateThreshold;
  }

  /** @inheritdoc */
  reset(): void {
    this.durations.length = 0;
  }
}
