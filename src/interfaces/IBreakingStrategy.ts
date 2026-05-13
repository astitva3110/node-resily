/**
 * Snapshot of rolling-window statistics supplied to breaking strategies.
 * Shape matches {@link WindowStats} from the circuit breaker core.
 */
export interface BreakingWindowSnapshot {
  /** Number of successful calls in the window. */
  successes: number;
  /** Number of failed calls in the window. */
  failures: number;
  /** Total calls in the window. */
  total: number;
  /** Fraction of calls that failed — a value in [0, 1]. */
  errorRate: number;
}

/**
 * Context passed to {@link IBreakingStrategy.shouldOpen} after each completed
 * invocation (and after failures have been counted into the rolling window).
 */
export interface BreakingStrategyContext {
  /** Consecutive counted breaking failures after this invocation's bookkeeping. */
  consecutiveFailures: number;
  /** Aggregated rolling-window statistics. */
  windowStats: BreakingWindowSnapshot;
  /** Elapsed milliseconds for the invocation that just finished. */
  durationMs: number;
  /**
   * `true` when this call was counted as a breaking failure (rolling failure counter
   * and bucket were updated).
   */
  countedAsBreakingFailure: boolean;
  /** Error from a rejected invocation; absent for successful completions. */
  error?: Error;
}

/**
 * Defines the contract for pluggable circuit-breaking logic.
 *
 * Implement this interface to provide custom logic that determines
 * when a circuit should trip to the open state.
 */
export interface IBreakingStrategy {
  /**
   * Called after every invocation completes, with elapsed time. Window-based strategies
   * may ignore this; slow-call strategies record durations here.
   *
   * @param durationMs - Elapsed time for the completed call.
   */
  afterInvoke(durationMs: number): void;

  /**
   * Returns `true` when the circuit should move to OPEN. Invoked after each call finishes
   * and after counted failures have been applied to the rolling window.
   *
   * @param context - Outcome, window snapshot, and consecutive failure count.
   */
  shouldOpen(context: BreakingStrategyContext): boolean;

  /**
   * Resets any internal state tracked by this strategy (e.g. counters, timestamps).
   * Called by the circuit breaker when it transitions back to the closed state.
   */
  reset(): void;
}
