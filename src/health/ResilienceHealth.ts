import type {
  CircuitBreaker,
  CircuitState,
  WindowStats,
} from '../core/CircuitBreaker';
import type { IHealthStatus, IHealthSummary, IHealthWindowStats } from '../interfaces/IHealthStatus';

/** Optional label for diagnostics (not surfaced in summaries). */
export interface ResilienceHealthOptions {
  /** Friendly name identifying this aggregator instance (e.g. `"edge-gateway"`). */
  name?: string;
}

/** Maps internal breaker state to externally published uppercase codes. */
function toHealthCircuitState(state: CircuitState): IHealthStatus['state'] {
  switch (state) {
    case 'closed':
      return 'CLOSED';
    case 'open':
      return 'OPEN';
    case 'half-open':
      return 'HALF_OPEN';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function windowFractionToPercentage(fraction: number): number {
  return fraction * 100;
}

/**
 * Registry that observes multiple {@link CircuitBreaker} instances and aggregates their health signals.
 *
 * Tracks each breaker’s uptime from the instant it is registered onward; every breaker event
 * (`open`, `close`, `halfOpen`) resets that breaker’s uptime clock.
 *
 * @example
 * ```ts
 * const health = new ResilienceHealth();
 *
 * health
 *   .register(paymentBreaker)
 *   .register(inventoryBreaker);
 *
 * console.log(health.isHealthy()); // Only when every breaker is CLOSED.
 * ```
 */
export class ResilienceHealth {
  private readonly registryLabel?: string;

  private readonly registry = new Map<string, CircuitBreaker>();

  private readonly lastTransitionAtMs = new Map<string, number>();

  private readonly onStateChangeHandlers = new Map<string, () => void>();

  /**
   * @param options - Optional label for observability overlays.
   */
  constructor(options: ResilienceHealthOptions = {}) {
    this.registryLabel = options.name;
  }

  /**
   * Fluent registration hook that wires breaker lifecycle listeners.
   *
   * @throws Error When a breaker whose `name` is already registered joins the roster.
   * @returns The same aggregator instance (`this`) for chaining.
   */
  register(breaker: CircuitBreaker): this {
    const { name } = breaker;

    if (this.registry.has(name)) {
      throw new Error(
        `ResilienceHealth.register: circuit breaker "${name}" is already registered.`,
      );
    }

    const recordTransition = (): void => {
      this.lastTransitionAtMs.set(name, Date.now());
    };

    breaker.on('open', recordTransition);
    breaker.on('close', recordTransition);
    breaker.on('halfOpen', recordTransition);

    recordTransition(); // Initialise uptime anchor at registration.

    this.registry.set(name, breaker);
    this.onStateChangeHandlers.set(name, recordTransition);

    return this;
  }

  /** Human-friendly label configured at construction — useful for correlating dashboards. */
  get registryName(): string | undefined {
    return this.registryLabel;
  }

  /**
   * Detaches telemetry listeners without touching breaker runtime state beyond listener removal.
   */
  unregister(name: string): void {
    const breaker = this.registry.get(name);
    if (breaker === undefined) {
      return;
    }

    const handler = this.onStateChangeHandlers.get(name);

    if (handler !== undefined) {
      breaker.removeListener('open', handler);
      breaker.removeListener('close', handler);
      breaker.removeListener('halfOpen', handler);
      this.onStateChangeHandlers.delete(name);
    }

    this.registry.delete(name);
    this.lastTransitionAtMs.delete(name);
  }

  /**
   * Returns a single breaker snapshot keyed by canonical `CircuitBreaker.name`.
   *
   * @throws RangeError When the alias is absent from the roster.
   */
  getStatus(name: string): IHealthStatus {
    const breaker = this.registry.get(name);
    if (breaker === undefined) {
      throw new RangeError(`ResilienceHealth.getStatus: unknown circuit breaker "${name}".`);
    }
    return ResilienceHealth.buildStatus(breaker, this.computeUptimeMs(name));
  }

  /** Materialises every breaker in registration order (`Map` iteration semantics). */
  getAll(): IHealthStatus[] {
    return [...this.registry.values()].map((breaker) =>
      ResilienceHealth.buildStatus(breaker, this.computeUptimeMs(breaker.name)),
    );
  }

  /**
   * Aggregated dashboard payload with overall status derived from constituent circuits.
   */
  getSummary(): IHealthSummary {
    const services = this.getAll();
    const opened = services.filter((service) => service.state === 'OPEN').length;

    let status: IHealthSummary['status'];
    const totalBreakers = services.length;

    if (totalBreakers === 0) {
      status = 'healthy'; // Vacuous OK — operators may treat zero coverage separately.
    } else if (opened === totalBreakers) {
      status = 'critical';
    } else if (opened === 0) {
      status = 'healthy';
    } else {
      status = 'degraded';
    }

    const healthyBreakers = services.filter((svc) => svc.state === 'CLOSED').length;

    return {
      status,
      timestamp: new Date().toISOString(),
      services,
      totalBreakers,
      healthyBreakers,
    };
  }

  /**
   * Strict readiness helper — shorthand for callers that only care if every breaker is CLOSED.
   */
  isHealthy(): boolean {
    const snap = this.getAll();

    return snap.every((circuit) => circuit.state === 'CLOSED');
  }

  /** Materialises uptime from the breaker’s personalised transition watermark. */
  private computeUptimeMs(name: string): number {
    const anchorMs = this.lastTransitionAtMs.get(name) ?? Date.now();
    return Math.max(0, Date.now() - anchorMs);
  }

  /**
   * Projects `CircuitBreaker` primitives into outward-facing payloads (percent rounding via JS number).
   */
  private static buildStatus(breaker: CircuitBreaker, uptimeMs: number): IHealthStatus {
    const breakerState = breaker.getState();
    const window = breaker.getWindowStats();
    const windowSnapshot = ResilienceHealth.toWindow(window);
    const lastFailureAt = breaker.getLastBreakingFailureAt();

    return {
      name: breaker.name,
      state: toHealthCircuitState(breakerState),
      failureCount: breaker.getConsecutiveFailureCount(),
      errorRate: windowFractionToPercentage(window.errorRate),
      lastFailureTime: lastFailureAt > 0 ? lastFailureAt : undefined,
      healthy: breakerState === 'closed',
      uptime: uptimeMs,
      windowStats: windowSnapshot,
    };
  }

  private static toWindow(snapshot: WindowStats): IHealthWindowStats {
    return {
      successes: snapshot.successes,
      failures: snapshot.failures,
      total: snapshot.total,
      errorRate: snapshot.errorRate,
    };
  }
}
