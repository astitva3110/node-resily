/**
 * Optional context for {@link IResetStrategy.shouldReset} when the strategy
 * needs more than the circuit open timestamp (e.g. exponential backoff from
 * the last breaking failure).
 */
export interface ResetStrategyContext {
  /**
   * Timestamp (ms since epoch) of the most recent breaking failure recorded
   * by the circuit breaker, or `0` if none has been recorded this session.
   */
  lastBreakingFailureAt: number;
}

/**
 * Defines the contract for pluggable circuit-reset logic.
 *
 * Implement this interface to control when an open circuit is allowed
 * to transition to the half-open state and attempt recovery.
 */
export interface IResetStrategy {
  /**
   * Returns `true` when the circuit breaker should move from open → half-open
   * and attempt a probe request.
   *
   * @param openedAt - The timestamp (ms since epoch) when the circuit last opened.
   * @param context - Optional details; exponential strategies may prefer
   *   `lastBreakingFailureAt` as the cooldown anchor.
   */
  shouldReset(openedAt: number, context?: ResetStrategyContext): boolean;

  /**
   * Invoked after each **counted** breaking failure (before the circuit may open).
   * Use for adaptive backoff (e.g. {@link ExponentialResetStrategy}).
   */
  onBreakingFailure?(): void;

  /**
   * Invoked when the circuit returns to CLOSED after recovery (half-open success)
   * or when {@link import('../core/CircuitBreaker').CircuitBreaker.prototype.reset} is called.
   * Use to reset adaptive delay state.
   */
  onCircuitRecovered?(): void;
}
