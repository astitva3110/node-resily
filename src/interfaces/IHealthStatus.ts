/** Rolling-window stats mirrored from the breaker (fractional `errorRate` in `[0, 1]`). */
export interface IHealthWindowStats {
  successes: number;
  failures: number;
  total: number;
  errorRate: number;
}

/** One breaker snapshot for dashboards and probes (states uppercase for HTTP-style payloads). */
export interface IHealthStatus {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  /** Error rate as percentage `[0, 100]` (window fraction × 100). */
  errorRate: number;
  lastFailureTime?: number;
  healthy: boolean;
  uptime: number;
  windowStats: IHealthWindowStats;
}

/** Aggregate over registered breakers (`healthy` · `degraded` · `critical`). */
export interface IHealthSummary {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  services: IHealthStatus[];
  totalBreakers: number;
  healthyBreakers: number;
}
