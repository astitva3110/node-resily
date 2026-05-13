import type { IResetStrategy, ResetStrategyContext } from '../../interfaces/IResetStrategy';

/**
 * Configuration for {@link ExponentialResetStrategy}.
 */
export interface ExponentialResetStrategyConfig {
  /** First cooldown after failures (milliseconds). */
  initialDelayMs: number;

  /** Multiplier applied to the current delay after each breaking failure notification. */
  multiplier: number;

  /** Ceiling for the backoff delay (milliseconds). */
  maxDelayMs: number;
}

/**
 * Cooldown grows exponentially after counted breaking failures while the circuit stays open,
 * and resets on recovery (half-open probe success or a manual breaker `reset`).
 */
export class ExponentialResetStrategy implements IResetStrategy {
  private readonly multiplier: number;

  private readonly maxDelayMs: number;

  private readonly initialDelayMs: number;

  private currentDelayMs: number;

  /**
   * @param config - Initial delay, backoff factor, and cap.
   */
  constructor(config: ExponentialResetStrategyConfig) {
    const { initialDelayMs, multiplier, maxDelayMs } = config;

    if (initialDelayMs < 0) {
      throw new RangeError('initialDelayMs must be non-negative');
    }

    if (multiplier < 1) {
      throw new RangeError('multiplier must be at least 1');
    }

    if (maxDelayMs < initialDelayMs) {
      throw new RangeError('maxDelayMs must be >= initialDelayMs');
    }

    this.initialDelayMs = initialDelayMs;
    this.multiplier = multiplier;
    this.maxDelayMs = maxDelayMs;
    this.currentDelayMs = initialDelayMs;
  }

  /** @inheritdoc */
  shouldReset(openedAt: number, context?: ResetStrategyContext): boolean {
    const anchor =
      context?.lastBreakingFailureAt !== undefined &&
      context.lastBreakingFailureAt > 0
        ? context.lastBreakingFailureAt
        : openedAt;
    return Date.now() - anchor >= this.currentDelayMs;
  }

  /** @inheritdoc */
  onBreakingFailure(): void {
    this.currentDelayMs = Math.min(
      this.currentDelayMs * this.multiplier,
      this.maxDelayMs,
    );
  }

  /** @inheritdoc */
  onCircuitRecovered(): void {
    this.currentDelayMs = this.initialDelayMs;
  }
}
