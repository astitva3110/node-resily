/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('prom-client', () => ({
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    remove: jest.fn(),
  })),
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    remove: jest.fn(),
  })),
  Registry: jest.fn().mockReturnValue({}),
}));

import { PrometheusAdapter } from '../../../src/prometheus/PrometheusAdapter';
import { CircuitBreaker } from '../../../src/core/CircuitBreaker';
import { ConsecutiveFailureBreakingStrategy } from '../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../../../src/strategies/reset/TimeBasedResetStrategy';

const promMock = jest.requireMock('prom-client') as {
  Gauge: jest.Mock;
  Counter: jest.Mock;
  Registry: jest.Mock;
};

function makeBreaker(name = 'paymentService'): CircuitBreaker {
  return new CircuitBreaker({
    name,
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
    resetStrategy: new TimeBasedResetStrategy(0),
  });
}

function makeRegistry(): any {
  return {};
}

function makeAdapter(): PrometheusAdapter {
  return new PrometheusAdapter({ registry: makeRegistry() });
}

/** Returns the Nth Gauge instance created since the last beforeEach reset. */
function gauge(index: number) {
  return promMock.Gauge.mock.results[index]?.value as {
    set: jest.Mock;
    remove: jest.Mock;
  };
}

/** Returns the Nth Counter instance created since the last beforeEach reset. */
function counter(index: number) {
  return promMock.Counter.mock.results[index]?.value as {
    inc: jest.Mock;
    remove: jest.Mock;
  };
}

beforeEach(() => {
  promMock.Gauge.mockClear();
  promMock.Counter.mockClear();
  promMock.Registry.mockClear();
  // Fresh mock instances so call counts start at 0
  promMock.Gauge.mockImplementation(() => ({ set: jest.fn(), remove: jest.fn() }));
  promMock.Counter.mockImplementation(() => ({ inc: jest.fn(), remove: jest.fn() }));
});

// ── Construction ───────────────────────────────────────────────────────────────

describe('PrometheusAdapter — construction', () => {
  it('registers exactly 2 gauges and 2 counters', () => {
    makeAdapter();
    expect(promMock.Gauge).toHaveBeenCalledTimes(2);
    expect(promMock.Counter).toHaveBeenCalledTimes(2);
  });

  it('registers node_resily_circuit_state gauge', () => {
    makeAdapter();
    const names = promMock.Gauge.mock.calls.map((c: any[]) => (c[0] as { name: string }).name);
    expect(names).toContain('node_resily_circuit_state');
  });

  it('registers node_resily_circuit_error_rate gauge', () => {
    makeAdapter();
    const names = promMock.Gauge.mock.calls.map((c: any[]) => (c[0] as { name: string }).name);
    expect(names).toContain('node_resily_circuit_error_rate');
  });

  it('registers node_resily_circuit_failures_total counter', () => {
    makeAdapter();
    const names = promMock.Counter.mock.calls.map((c: any[]) => (c[0] as { name: string }).name);
    expect(names).toContain('node_resily_circuit_failures_total');
  });

  it('registers node_resily_circuit_success_total counter', () => {
    makeAdapter();
    const names = promMock.Counter.mock.calls.map((c: any[]) => (c[0] as { name: string }).name);
    expect(names).toContain('node_resily_circuit_success_total');
  });

  it('all metrics are registered with the "name" label', () => {
    makeAdapter();
    const gaugeLabels = promMock.Gauge.mock.calls.map(
      (c: any[]) => (c[0] as { labelNames: string[] }).labelNames,
    );
    const counterLabels = promMock.Counter.mock.calls.map(
      (c: any[]) => (c[0] as { labelNames: string[] }).labelNames,
    );
    for (const labels of [...gaugeLabels, ...counterLabels]) {
      expect(labels).toContain('name');
    }
  });

  it('registers all metrics with the provided registry', () => {
    const registry = makeRegistry();
    new PrometheusAdapter({ registry });
    const registries = promMock.Gauge.mock.calls.map(
      (c: any[]) => (c[0] as { registers: unknown[] }).registers,
    );
    expect(registries[0]).toContain(registry);
  });
});

// ── observe() ─────────────────────────────────────────────────────────────────

describe('PrometheusAdapter — observe()', () => {
  it('sets initial state=0 (closed) for a freshly-created breaker', () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker();

    adapter.observe(breaker);

    // Gauge[0] = stateGauge
    expect(gauge(0).set).toHaveBeenCalledWith({ name: 'paymentService' }, 0);
  });

  it('sets initial state=1 (open) for an already-open breaker', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker();
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    adapter.observe(breaker);

    expect(gauge(0).set).toHaveBeenCalledWith({ name: 'paymentService' }, 1);
  });

  it('increments the success counter on a successful call', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.resolve('ok'));

    // Counter[1] = successCounter
    expect(counter(1).inc).toHaveBeenCalledWith({ name: 'svc' });
  });

  it('increments the failure counter on a failed call', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.reject(new Error('down'))).catch(() => {});

    // Counter[0] = failuresCounter
    expect(counter(0).inc).toHaveBeenCalledWith({ name: 'svc' });
  });

  it('sets state gauge to 1 (open) when the circuit opens', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.reject(new Error('down'))).catch(() => {});

    expect(gauge(0).set).toHaveBeenCalledWith({ name: 'svc' }, 1);
  });

  it('sets state gauge to 0 (closed) when the circuit closes', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.reject(new Error('down'))).catch(() => {});
    // 0-ms reset → half-open probe → success → closed
    await breaker.execute(() => Promise.resolve('ok'));

    expect(gauge(0).set).toHaveBeenCalledWith({ name: 'svc' }, 0);
  });

  it('updates the error rate gauge after a successful call', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.resolve('ok'));

    // Gauge[1] = errorRateGauge
    expect(gauge(1).set).toHaveBeenCalledWith({ name: 'svc' }, expect.any(Number));
  });

  it('updates the error rate gauge after a failed call', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);

    await breaker.execute(() => Promise.reject(new Error('err'))).catch(() => {});

    expect(gauge(1).set).toHaveBeenCalledWith({ name: 'svc' }, expect.any(Number));
  });

  it('returns the adapter for chaining', () => {
    const adapter = makeAdapter();
    expect(adapter.observe(makeBreaker())).toBe(adapter);
  });

  it('replaces the previous subscription when called twice with the same name', () => {
    const adapter = makeAdapter();
    const breaker1 = makeBreaker('svc');
    const breaker2 = makeBreaker('svc');

    adapter.observe(breaker1);
    adapter.observe(breaker2);

    expect(gauge(0).remove).toHaveBeenCalledWith({ name: 'svc' });
  });
});

// ── unobserve() ───────────────────────────────────────────────────────────────

describe('PrometheusAdapter — unobserve()', () => {
  it('removes label set from all metrics for the named breaker', () => {
    const adapter = makeAdapter();
    adapter.observe(makeBreaker('svc'));

    adapter.unobserve('svc');

    expect(gauge(0).remove).toHaveBeenCalledWith({ name: 'svc' });
    expect(counter(0).remove).toHaveBeenCalledWith({ name: 'svc' });
    expect(counter(1).remove).toHaveBeenCalledWith({ name: 'svc' });
  });

  it('does not throw for an unknown name', () => {
    const adapter = makeAdapter();
    expect(() => adapter.unobserve('nonexistent')).not.toThrow();
  });

  it('stops updating metrics after unobserve', async () => {
    const adapter = makeAdapter();
    const breaker = makeBreaker('svc');
    adapter.observe(breaker);
    adapter.unobserve('svc');

    const incsBefore = counter(0).inc.mock.calls.length;
    await breaker.execute(() => Promise.reject(new Error('down'))).catch(() => {});

    expect(counter(0).inc.mock.calls.length).toBe(incsBefore);
  });

  it('returns the adapter for chaining', () => {
    const adapter = makeAdapter();
    expect(adapter.unobserve('nonexistent')).toBe(adapter);
  });
});

// ── unobserveAll() ────────────────────────────────────────────────────────────

describe('PrometheusAdapter — unobserveAll()', () => {
  it('cleans up metrics for every observed breaker', () => {
    const adapter = makeAdapter();
    adapter.observe(makeBreaker('a'));
    adapter.observe(makeBreaker('b'));

    adapter.unobserveAll();

    const removedNames = gauge(0).remove.mock.calls.map(
      (c: any[]) => (c[0] as { name: string }).name,
    );
    expect(removedNames).toContain('a');
    expect(removedNames).toContain('b');
  });

  it('is idempotent when called twice', () => {
    const adapter = makeAdapter();
    adapter.observe(makeBreaker('svc'));
    adapter.unobserveAll();
    expect(() => adapter.unobserveAll()).not.toThrow();
  });

  it('returns the adapter for chaining', () => {
    const adapter = makeAdapter();
    expect(adapter.unobserveAll()).toBe(adapter);
  });
});
