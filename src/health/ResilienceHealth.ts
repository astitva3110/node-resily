import type {
  CircuitBreaker,
  CircuitState,
  WindowStats,
} from '../core/CircuitBreaker';
import type { IHealthStatus, IHealthSummary, IHealthWindowStats } from '../interfaces/IHealthStatus';

/** Optional registry label for operators (not included in summaries). */
export interface ResilienceHealthOptions {
  name?: string;
}

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

/** Registers {@link CircuitBreaker} instances and aggregates health (`getSummary`, `isHealthy`). */
export class ResilienceHealth {
  private readonly registryLabel?: string;

  private readonly registry = new Map<string, CircuitBreaker>();

  private readonly lastTransitionAtMs = new Map<string, number>();

  private readonly onStateChangeHandlers = new Map<string, () => void>();

  /** Optional `name` for operators (not part of summary payloads). */
  constructor(options: ResilienceHealthOptions = {}) {
    this.registryLabel = options.name;
  }

  /** Subscribes to state events; throws on duplicate `breaker.name`. */
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

    recordTransition();

    this.registry.set(name, breaker);
    this.onStateChangeHandlers.set(name, recordTransition);

    return this;
  }

  /** Optional label from constructor. */
  get registryName(): string | undefined {
    return this.registryLabel;
  }

  /** Removes listeners and drops the breaker from aggregation. */
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

  /** Live snapshot for a registered `name`; throws if unknown. */
  getStatus(name: string): IHealthStatus {
    const breaker = this.registry.get(name);
    if (breaker === undefined) {
      throw new RangeError(`ResilienceHealth.getStatus: unknown circuit breaker "${name}".`);
    }
    return ResilienceHealth.buildStatus(breaker, this.computeUptimeMs(name));
  }

  /** All breakers in registration order. */
  getAll(): IHealthStatus[] {
    return [...this.registry.values()].map((breaker) =>
      ResilienceHealth.buildStatus(breaker, this.computeUptimeMs(breaker.name)),
    );
  }

  /** Rolled-up status plus per-breaker rows. */
  getSummary(): IHealthSummary {
    const services = this.getAll();
    const opened = services.filter((service) => service.state === 'OPEN').length;

    let status: IHealthSummary['status'];
    const totalBreakers = services.length;

    if (totalBreakers === 0) {
      status = 'healthy';
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

  /** True when every registered breaker is CLOSED. */
  isHealthy(): boolean {
    const snap = this.getAll();

    return snap.every((circuit) => circuit.state === 'CLOSED');
  }

  private computeUptimeMs(name: string): number {
    const anchorMs = this.lastTransitionAtMs.get(name) ?? Date.now();
    return Math.max(0, Date.now() - anchorMs);
  }

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
