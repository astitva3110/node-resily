import type { Registry, Gauge, Counter } from 'prom-client';
import type { CircuitBreaker } from '../core/CircuitBreaker';

const STATE_MAP = { closed: 0, open: 1, 'half-open': 2 } as const;

/** Options for {@link PrometheusAdapter}. */
export interface PrometheusAdapterOptions {
  /** prom-client Registry to register metrics with. */
  registry: Registry;
}

/**
 * Subscribes to {@link CircuitBreaker} events and exposes rolling Prometheus metrics.
 *
 * Requires `prom-client` as a peer dependency.
 *
 * @example
 * const adapter = new PrometheusAdapter({ registry });
 * adapter.observe(paymentBreaker).observe(inventoryBreaker);
 * // GET /metrics → registry.metrics()
 */
export class PrometheusAdapter {
  private readonly stateGauge: Gauge<string>;
  private readonly failuresCounter: Counter<string>;
  private readonly successCounter: Counter<string>;
  private readonly errorRateGauge: Gauge<string>;

  /** Unsubscribe functions keyed by breaker name. */
  private readonly observers = new Map<string, () => void>();

  constructor(options: PrometheusAdapterOptions) {
    const { Gauge, Counter } = require('prom-client') as {
      Gauge: new (cfg: object) => Gauge<string>;
      Counter: new (cfg: object) => Counter<string>;
    };

    const reg = options.registry;

    this.stateGauge = new Gauge({
      name: 'node_resily_circuit_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['name'],
      registers: [reg],
    });

    this.failuresCounter = new Counter({
      name: 'node_resily_circuit_failures_total',
      help: 'Total number of circuit breaker failures',
      labelNames: ['name'],
      registers: [reg],
    });

    this.successCounter = new Counter({
      name: 'node_resily_circuit_success_total',
      help: 'Total number of circuit breaker successes',
      labelNames: ['name'],
      registers: [reg],
    });

    this.errorRateGauge = new Gauge({
      name: 'node_resily_circuit_error_rate',
      help: 'Rolling-window error rate for the circuit breaker',
      labelNames: ['name'],
      registers: [reg],
    });
  }

  /**
   * Subscribes to events on `breaker` and starts recording metrics.
   * Calling `observe` with the same breaker name replaces the previous subscription.
   */
  observe(breaker: CircuitBreaker): this {
    if (this.observers.has(breaker.name)) {
      this.unobserve(breaker.name);
    }

    const { name } = breaker;

    this.stateGauge.set({ name }, STATE_MAP[breaker.getState()]);

    const onSuccess = (): void => {
      this.successCounter.inc({ name });
      this.errorRateGauge.set({ name }, breaker.getWindowStats().errorRate);
    };

    const onFailure = (): void => {
      this.failuresCounter.inc({ name });
      this.errorRateGauge.set({ name }, breaker.getWindowStats().errorRate);
    };

    const onOpen = (): void => { this.stateGauge.set({ name }, STATE_MAP.open); };
    const onClose = (): void => { this.stateGauge.set({ name }, STATE_MAP.closed); };
    const onHalfOpen = (): void => { this.stateGauge.set({ name }, STATE_MAP['half-open']); };

    breaker.on('success', onSuccess);
    breaker.on('failure', onFailure);
    breaker.on('open', onOpen);
    breaker.on('close', onClose);
    breaker.on('halfOpen', onHalfOpen);

    this.observers.set(name, () => {
      breaker.off('success', onSuccess);
      breaker.off('failure', onFailure);
      breaker.off('open', onOpen);
      breaker.off('close', onClose);
      breaker.off('halfOpen', onHalfOpen);

      this.stateGauge.remove({ name });
      this.failuresCounter.remove({ name });
      this.successCounter.remove({ name });
      this.errorRateGauge.remove({ name });
    });

    return this;
  }

  /** Stops tracking the named breaker and removes its metrics. */
  unobserve(name: string): this {
    const cleanup = this.observers.get(name);
    if (cleanup) {
      cleanup();
      this.observers.delete(name);
    }
    return this;
  }

  /** Stops tracking all breakers and removes all metrics. Suitable for shutdown. */
  unobserveAll(): this {
    for (const name of [...this.observers.keys()]) {
      this.unobserve(name);
    }
    return this;
  }
}
