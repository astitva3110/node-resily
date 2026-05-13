import type { IResetStrategy, ResetStrategyContext } from '../../interfaces/IResetStrategy';

/** Fixed cooldown before half-open (milliseconds since open). */
export class TimeBasedResetStrategy implements IResetStrategy {
  private readonly cooldownMs: number;

  /** Half-open allowed after this many ms from open (0 = immediate probe eligibility). */
  constructor(cooldownMs: number) {
    if (cooldownMs < 0) {
      throw new RangeError('cooldownMs must be non-negative');
    }
    this.cooldownMs = cooldownMs;
  }

  /** True when `Date.now() - openedAt` exceeds the fixed cooldown. */
  shouldReset(openedAt: number, _context?: ResetStrategyContext): boolean {
    return Date.now() - openedAt >= this.cooldownMs;
  }
}
