import { CircuitBreaker } from '../../../src/core/CircuitBreaker';
import { ConsecutiveFailureBreakingStrategy } from '../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../../../src/strategies/reset/TimeBasedResetStrategy';
import { ResilienceHealth } from '../../../src/health/ResilienceHealth';

const alwaysFail = (): Promise<never> => Promise.reject(new Error('downstream'));

describe('ResilienceHealth', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('register() adds a breaker (chaining multiple registers)', () => {
    jest.setSystemTime(1_000);

    const paymentService = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(5),
    });
    const inventoryService = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(5),
    });
    const shippingService = new CircuitBreaker({
      name: 'shippingService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(5),
    });

    const health = new ResilienceHealth();
    health.register(paymentService).register(inventoryService).register(shippingService);

    expect(health.getAll()).toHaveLength(3);

    jest.setSystemTime(8_000);
    expect(health.getStatus('paymentService').uptime).toBe(7_000);
    expect(health.getStatus('inventoryService').uptime).toBe(7_000);
    expect(health.getStatus('shippingService').uptime).toBe(7_000);
  });

  it('tracks independent uptime anchors when breakers register at different times', () => {
    jest.setSystemTime(1_000);

    const paymentService = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(5),
    });
    const inventoryService = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(5),
    });

    const health = new ResilienceHealth();
    health.register(paymentService);

    jest.setSystemTime(3_000);
    health.register(inventoryService);

    jest.setSystemTime(8_000);
    expect(health.getStatus('paymentService').uptime).toBe(7_000);
    expect(health.getStatus('inventoryService').uptime).toBe(5_000);
  });

  it('throws when registering duplicate breaker names', () => {
    const b = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
    });
    const dup = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
    });

    const health = new ResilienceHealth();
    health.register(b);
    expect(() => health.register(dup)).toThrow(/already registered/);
  });

  it('unregister() removes breaker and dismantles telemetry hooks', async () => {
    const breaker = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });

    const health = new ResilienceHealth();
    health.register(breaker);

    expect(breaker.listenerCount('open')).toBe(1);
    expect(breaker.listenerCount('close')).toBe(1);
    expect(breaker.listenerCount('halfOpen')).toBe(1);

    health.unregister('paymentService');

    expect(breaker.listenerCount('open')).toBe(0);
    expect(breaker.listenerCount('close')).toBe(0);
    expect(breaker.listenerCount('halfOpen')).toBe(0);

    // Further emissions should not resurrect registry bookkeeping.
    await breaker.execute(alwaysFail).catch(() => {
      /* expected */
    });
    expect(health.getAll()).toHaveLength(0);
  });

  it('getStatus() surfaces live breaker metrics', async () => {
    const breaker = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
    });

    const health = new ResilienceHealth();
    health.register(breaker);

    await breaker.execute(alwaysFail).catch(() => {
      /* expected */
    });

    const status = health.getStatus('inventoryService');
    expect(status.name).toBe('inventoryService');
    expect(status.state).toBe('CLOSED');
    expect(status.failureCount).toBe(1);
    expect(status.healthy).toBe(true);
    expect(status.windowStats.failures).toBe(1);
    expect(status.errorRate).toBeCloseTo(
      status.windowStats.errorRate * 100,
    );
  });

  it('getStatus() throws when name missing', () => {
    expect(() => new ResilienceHealth().getStatus('missing')).toThrow(RangeError);
  });

  it('reports lastFailureTime after counted breaker failures', async () => {
    jest.setSystemTime(42);

    const breaker = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
    });

    const health = new ResilienceHealth();
    health.register(breaker);

    await breaker.execute(alwaysFail).catch(() => {
      /* expected */
    });

    expect(health.getStatus('paymentService').lastFailureTime).toBe(42);
  });

  it('getSummary() resolves healthy ⇢ degraded ⇢ critical', async () => {
    const alpha = new CircuitBreaker({
      name: 'paymentService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });
    const beta = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });
    const gamma = new CircuitBreaker({
      name: 'shippingService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });

    const health = new ResilienceHealth();
    health.register(alpha).register(beta).register(gamma);

    expect(health.getSummary().status).toBe('healthy');
    expect(health.isHealthy()).toBe(true);

    await alpha.execute(alwaysFail).catch(() => {
      /* expected */
    });

    expect(health.getSummary().status).toBe('degraded');
    expect(health.isHealthy()).toBe(false);
    expect(health.getSummary().healthyBreakers).toBe(2);

    await beta.execute(alwaysFail).catch(() => {
      /* expected */
    });

    await gamma.execute(alwaysFail).catch(() => {
      /* expected */
    });

    const critical = health.getSummary();
    expect(critical.status).toBe('critical');
    expect(critical.healthyBreakers).toBe(0);
    expect(critical.services.every((svc) => svc.state === 'OPEN')).toBe(true);
  });

  it('isHealthy() stays true when registry empty', () => {
    expect(new ResilienceHealth().isHealthy()).toBe(true);
  });

  it('resets uptime after state transitions', async () => {
    jest.setSystemTime(0);

    const breaker = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(0),
    });

    const health = new ResilienceHealth();
    health.register(breaker);

    jest.setSystemTime(5_000);
    await breaker.execute(alwaysFail).catch(() => {
      /* expected */
    }); // emits `open`

    jest.setSystemTime(5_200);
    expect(health.getStatus('inventoryService').uptime).toBe(200);
  });

  describe('getSummary() threshold boundaries', () => {
    // Implementation: critical ⇔ opened === totalBreakers; healthy ⇔ opened === 0; else degraded.

    function makeBreaker(name: string) {
      return new CircuitBreaker({
        name,
        breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
        resetStrategy: new TimeBasedResetStrategy(60_000),
      });
    }

    it('reports healthy when 0 of 3 breakers are open', async () => {
      const health = new ResilienceHealth();
      health.register(makeBreaker('a')).register(makeBreaker('b')).register(makeBreaker('c'));

      const summary = health.getSummary();
      expect(summary.status).toBe('healthy');
      expect(summary.services.filter((s) => s.state === 'OPEN')).toHaveLength(0);
      expect(summary.healthyBreakers).toBe(3);
    });

    it('reports degraded when exactly 1 of 3 breakers is open', async () => {
      const health = new ResilienceHealth();
      const alpha = makeBreaker('a');
      health.register(alpha).register(makeBreaker('b')).register(makeBreaker('c'));

      await alpha.execute(alwaysFail).catch(() => {
        /* expected */
      });

      const summary = health.getSummary();
      expect(summary.status).toBe('degraded');
      expect(summary.services.filter((s) => s.state === 'OPEN')).toHaveLength(1);
      expect(summary.healthyBreakers).toBe(2);
    });

    it('reports degraded when exactly 2 of 3 breakers are open', async () => {
      const health = new ResilienceHealth();
      const alpha = makeBreaker('a');
      const beta = makeBreaker('b');
      health.register(alpha).register(beta).register(makeBreaker('c'));

      await alpha.execute(alwaysFail).catch(() => {
        /* expected */
      });
      await beta.execute(alwaysFail).catch(() => {
        /* expected */
      });

      const summary = health.getSummary();
      expect(summary.status).toBe('degraded');
      expect(summary.services.filter((s) => s.state === 'OPEN')).toHaveLength(2);
      expect(summary.healthyBreakers).toBe(1);
    });

    it('reports critical only when every breaker is open', async () => {
      const health = new ResilienceHealth();
      const alpha = makeBreaker('a');
      const beta = makeBreaker('b');
      const gamma = makeBreaker('c');
      health.register(alpha).register(beta).register(gamma);

      await alpha.execute(alwaysFail).catch(() => {
        /* expected */
      });
      await beta.execute(alwaysFail).catch(() => {
        /* expected */
      });
      expect(health.getSummary().status).toBe('degraded');

      await gamma.execute(alwaysFail).catch(() => {
        /* expected */
      });
      expect(health.getSummary().status).toBe('critical');
    });
  });

  describe('getAll()', () => {
    it('matches getStatus shape and registration order names', async () => {
      const health = new ResilienceHealth();

      const payment = new CircuitBreaker({
        name: 'payment',
        breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      });
      const inventory = new CircuitBreaker({
        name: 'inventory',
        breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
      });

      jest.setSystemTime(10_000);
      health.register(payment).register(inventory);

      await payment.execute(alwaysFail).catch(() => {
        /* expected */
      });

      const rowNames = health.getAll().map((row) => row.name);
      expect(rowNames).toEqual(['payment', 'inventory']);

      const all = health.getAll();
      expect(all[0]).toEqual(health.getStatus('payment'));
      expect(all[1]).toEqual(health.getStatus('inventory'));

      const shapeKeys: (keyof typeof all[0])[] = [
        'name',
        'state',
        'healthy',
        'failureCount',
        'windowStats',
        'errorRate',
        'uptime',
        'lastFailureTime',
      ];
      for (const row of all) {
        for (const key of shapeKeys) {
          expect(row).toHaveProperty(key);
        }
        expect(row.windowStats).toMatchObject({
          successes: expect.any(Number),
          failures: expect.any(Number),
          total: expect.any(Number),
          errorRate: expect.any(Number),
        });
      }
    });
  });

  it('surfaces HALF_OPEN while the breaker probes mid-flight', async () => {
    const breaker = new CircuitBreaker({
      name: 'inventoryService',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(0),
    });

    const health = new ResilienceHealth();
    health.register(breaker);

    await breaker.execute(alwaysFail).catch(() => {
      /* expected */
    }); // transitions OPEN

    let sawHalfOpen = false;

    breaker.once('halfOpen', () => {
      sawHalfOpen = health.getStatus('inventoryService').state === 'HALF_OPEN';
    });

    await breaker.execute(async () => 'recovery');

    expect(sawHalfOpen).toBe(true);
    expect(health.getStatus('inventoryService').state).toBe('CLOSED');
  });
});
