/** Classifies thrown errors and resolved values for breaking and statistics. */
export interface IFailureDetector {
  /** Counts toward breaking failures and window stats when true. */
  isFailure(error: unknown): boolean;

  /** Successful half-open probes and window successes when true. */
  isSuccess(result: unknown): boolean;
}

/** @deprecated Use {@link IFailureDetector}. */
export type IFailureDetectionStrategy = IFailureDetector;
