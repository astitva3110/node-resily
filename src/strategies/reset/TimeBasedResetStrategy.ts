import type { IResetStrategy, ResetStrategyContext } from '../../interfaces/IResetStrategy';

/**
 * Built-in reset strategy that waits a fixed duration before allowing
 * the circuit breaker to move from open → half-open.
 *
 * @example
 * ```ts
 * const strategy = new TimeBasedResetStrategy(30_000); // 30 s cooldown
 * ```
 */
export class TimeBasedResetStrategy implements IResetStrategy {
  private readonly cooldownMs: number;

  /**
   * @param cooldownMs - Milliseconds to wait after the circuit opened before
   *                     a half-open probe is allowed.
   */
  constructor(cooldownMs: number) {
    if (cooldownMs < 0) {
      throw new RangeError('cooldownMs must be non-negative');
    }
    this.cooldownMs = cooldownMs;
  }

  /** @inheritdoc */
  shouldReset(openedAt: number, _context?: ResetStrategyContext): boolean {
    return Date.now() - openedAt >= this.cooldownMs;
  }
}
