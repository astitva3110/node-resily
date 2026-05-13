import type { BreakingStrategyContext, IBreakingStrategy } from '../../interfaces/IBreakingStrategy';

/** Opens after N counted consecutive breaking failures. */
export class ConsecutiveFailureBreakingStrategy implements IBreakingStrategy {
  private readonly threshold: number;

  constructor(threshold: number) {
    if (threshold < 1) {
      throw new RangeError('threshold must be at least 1');
    }
    this.threshold = threshold;
  }

  /** No-op; this strategy only uses the breaker’s consecutive-failure counter. */
  afterInvoke(_durationMs: number): void {}

  /** Opens when counted consecutive failures reach `threshold`. */
  shouldOpen(context: BreakingStrategyContext): boolean {
    return (
      context.countedAsBreakingFailure &&
      context.consecutiveFailures >= this.threshold
    );
  }

  /** No-op; no mutable state beyond the threshold constant. */
  reset(): void {}
}
