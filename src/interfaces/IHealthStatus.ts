/**
 * Rolling-window aggregates mirrored from {@link import('../core/CircuitBreaker').CircuitBreaker.getWindowStats}.
 *
 * `errorRate` matches the breaker’s rolling window: a fraction in **[0, 1]** (failures / total calls).
 */
export interface IHealthWindowStats {
  /** Successful calls observed in the current window. */
  successes: number;
  /** Failed calls observed in the current window. */
  failures: number;
  /** Sum of successes and failures within the window. */
  total: number;
  /** Fraction of failures in the window `[0, 1]`. */
  errorRate: number;
}

/**
 * Single circuit breaker snapshot for observability dashboards and readiness probes.
 */
export interface IHealthStatus {
  /** Breaker identifier (matches {@link import('../core/CircuitBreaker').CircuitBreaker.name}). */
  name: string;
  /** Discrete breaker state rendered in uppercase for HTTP-style payloads. */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  /** Same counter as {@link import('../core/CircuitBreaker').CircuitBreaker.getConsecutiveFailureCount}. */
  failureCount: number;
  /**
   * Rolling-window error percentage in **[0, 100]** (derived from the breaker’s fractional error rate × 100).
   */
  errorRate: number;
  /** Epoch ms of the last counted breaking failure, when known. */
  lastFailureTime?: number;
  /** Convenience flag: strictly `CLOSED`. */
  healthy: boolean;
  /** Milliseconds since the breaker last transitioned `open`, `close`, or `halfOpen`. */
  uptime: number;
  /** Detailed rolling-window numbers for alerting and SLO dashboards. */
  windowStats: IHealthWindowStats;
}

/**
 * Rolled-up view across every registered breaker.
 */
export interface IHealthSummary {
  /** `healthy`: every breaker CLOSED • `critical`: every breaker OPEN • `degraded`: any other mixture. */
  status: 'healthy' | 'degraded' | 'critical';
  /** ISO timestamp when this summary materialized. */
  timestamp: string;
  /** Snapshot per registered breaker, in insertion order where possible (Map insertion order). */
  services: IHealthStatus[];
  /** Number of circuits under management. */
  totalBreakers: number;
  /** Count of circuits currently `CLOSED`. */
  healthyBreakers: number;
}
