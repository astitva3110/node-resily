import type { IResetStrategy, ResetStrategyContext } from '../../interfaces/IResetStrategy';

/** Options for {@link ExponentialResetStrategy}. */
export interface ExponentialResetStrategyConfig {
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

/** Cooldown grows on `onBreakingFailure` while open; resets on recovery. */
export class ExponentialResetStrategy implements IResetStrategy {
  private readonly multiplier: number;

  private readonly maxDelayMs: number;

  private readonly initialDelayMs: number;

  private currentDelayMs: number;

  /** Validates initial delay, multiplier ≥ 1, and `maxDelayMs` ≥ initial. */
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

  /** True after `currentDelayMs` from `openedAt` or last breaking failure anchor. */
  shouldReset(openedAt: number, context?: ResetStrategyContext): boolean {
    const anchor =
      context?.lastBreakingFailureAt !== undefined &&
      context.lastBreakingFailureAt > 0
        ? context.lastBreakingFailureAt
        : openedAt;
    return Date.now() - anchor >= this.currentDelayMs;
  }

  /** Increases delay up to `maxDelayMs` after each counted breaking failure. */
  onBreakingFailure(): void {
    this.currentDelayMs = Math.min(
      this.currentDelayMs * this.multiplier,
      this.maxDelayMs,
    );
  }

  /** Resets delay to `initialDelayMs` after close or manual reset. */
  onCircuitRecovered(): void {
    this.currentDelayMs = this.initialDelayMs;
  }
}
