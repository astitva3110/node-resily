import type {
  BreakingStrategyContext,
  IBreakingStrategy,
} from '../../interfaces/IBreakingStrategy';

/** Configuration for {@link SlowCallBreakingStrategy}. */
export interface SlowCallBreakingStrategyConfig {
  slowCallDurationThreshold: number;
  slowCallRateThreshold: number;
  minRequestCount: number;
}

const MAX_DURATION_SAMPLES = 2_048;

/** Opens when too many recent calls exceed `slowCallDurationThreshold` (local duration ring buffer). */
export class SlowCallBreakingStrategy implements IBreakingStrategy {
  private readonly slowCallDurationThreshold: number;

  private readonly slowCallRateThreshold: number;

  private readonly minRequestCount: number;

  private readonly durations: number[] = [];

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

  /** Appends duration samples for slow-rate evaluation (capped). */
  afterInvoke(durationMs: number): void {
    this.durations.push(durationMs);
    if (this.durations.length > MAX_DURATION_SAMPLES) {
      this.durations.splice(0, this.durations.length - MAX_DURATION_SAMPLES);
    }
  }

  /** Opens when slow calls are at least `slowCallRateThreshold` % of buffered durations. */
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

  /** Clears sampled durations (e.g. when the breaker closes). */
  reset(): void {
    this.durations.length = 0;
  }
}
