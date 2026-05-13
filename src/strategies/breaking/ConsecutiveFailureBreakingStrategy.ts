import type { BreakingStrategyContext, IBreakingStrategy } from '../../interfaces/IBreakingStrategy';

/**
 * Built-in breaking strategy that opens the circuit after a fixed number
 * of consecutive failures.
 *
 * @example
 * ```ts
 * const strategy = new ConsecutiveFailureBreakingStrategy(5);
 * // Circuit opens after 5 consecutive failures.
 * ```
 */
export class ConsecutiveFailureBreakingStrategy implements IBreakingStrategy {
  private readonly threshold: number;

  /**
   * @param threshold - Number of consecutive failures required to open the circuit.
   *                    Must be a positive integer.
   */
  constructor(threshold: number) {
    if (threshold < 1) {
      throw new RangeError('threshold must be at least 1');
    }
    this.threshold = threshold;
  }

  /** @inheritdoc */
  afterInvoke(_durationMs: number): void {
    // Stateless — slow-call tracking not used.
  }

  /** @inheritdoc */
  shouldOpen(context: BreakingStrategyContext): boolean {
    return (
      context.countedAsBreakingFailure &&
      context.consecutiveFailures >= this.threshold
    );
  }

  /** @inheritdoc */
  reset(): void {
    // Stateless strategy — nothing to reset.
  }
}
