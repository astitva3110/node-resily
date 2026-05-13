/** Extra inputs for reset timing (e.g. exponential backoff anchored on last failure). */
export interface ResetStrategyContext {
  lastBreakingFailureAt: number;
}

/** Decides when an open circuit may enter half-open; optional hooks for adaptive backoff. */
export interface IResetStrategy {
  /** True when a half-open probe may run (see `openedAt` and optional `context`). */
  shouldReset(openedAt: number, context?: ResetStrategyContext): boolean;

  /** Optional: extend cooldown after each counted breaking failure (e.g. exponential). */
  onBreakingFailure?(): void;

  /** Optional: reset adaptive state when the circuit closes or on manual reset. */
  onCircuitRecovered?(): void;
}
