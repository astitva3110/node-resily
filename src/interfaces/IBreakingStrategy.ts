/** Rolling-window snapshot passed to breaking strategies (matches breaker window stats). */
export interface BreakingWindowSnapshot {
  successes: number;
  failures: number;
  total: number;
  /** Fraction of calls that failed, in `[0, 1]`. */
  errorRate: number;
}

/** Inputs to {@link IBreakingStrategy.shouldOpen} after each completed call and window updates. */
export interface BreakingStrategyContext {
  consecutiveFailures: number;
  windowStats: BreakingWindowSnapshot;
  durationMs: number;
  /** Whether this invocation incremented breaking-failure counters. */
  countedAsBreakingFailure: boolean;
  error?: Error;
}

/** Decides when the circuit should open; slow-call strategies record latency in `afterInvoke`. */
export interface IBreakingStrategy {
  /** Slow-call strategies record latency here; others may no-op. */
  afterInvoke(durationMs: number): void;

  /** Whether the circuit should transition to open after this invocation. */
  shouldOpen(context: BreakingStrategyContext): boolean;

  /** Clears strategy-local state when the breaker closes. */
  reset(): void;
}
