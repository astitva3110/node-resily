import {
  AllErrorsFailureDetectionStrategy,
  Bulkhead,
  BulkheadFullError,
  CircuitBreaker,
  CircuitOpenError,
  CompositeFailureDetector,
  ConsecutiveFailureBreakingStrategy,
  CustomFailureDetector,
  DefaultFailureDetector,
  ErrorRateBreakingStrategy,
  ExponentialResetStrategy,
  GrpcFailureDetector,
  HttpFailureDetector,
  MaxRetriesExceededError,
  ResilienceHealth,
  Retry,
  SlowCallBreakingStrategy,
  TimeBasedResetStrategy,
  Timeout,
  TimeoutError,
  WithCircuitBreaker,
  WithRetry,
  WithTimeout,
} from 'node-resily';

describe('public API smoke (node-resily entry)', () => {
  it('exposes core primitives with minimal construction and calls', async () => {
    const breaker = new CircuitBreaker({ name: 'smoke' });
    expect(breaker.getState()).toBe('closed');

    await expect(
      new Retry({ maxAttempts: 1 }).execute(() => Promise.resolve('ok')),
    ).resolves.toBe('ok');

    await expect(new Timeout(100).execute(() => Promise.resolve(7))).resolves.toBe(7);

    await expect(new Bulkhead({ maxConcurrent: 1 }).execute(() => Promise.resolve())).resolves.toBeUndefined();
  });

  it('instantiates breaking strategies', () => {
    expect(() => new ConsecutiveFailureBreakingStrategy(1)).not.toThrow();

    expect(
      () =>
        new ErrorRateBreakingStrategy({
          failureRateThreshold: 50,
          minRequestCount: 1,
        }),
    ).not.toThrow();

    expect(
      () =>
        new SlowCallBreakingStrategy({
          slowCallDurationThreshold: 100,
          slowCallRateThreshold: 50,
          minRequestCount: 1,
        }),
    ).not.toThrow();
  });

  it('instantiates reset strategies', () => {
    expect(() => new TimeBasedResetStrategy(1000)).not.toThrow();
    expect(
      () =>
        new ExponentialResetStrategy({
          initialDelayMs: 100,
          multiplier: 2,
          maxDelayMs: 60_000,
        }),
    ).not.toThrow();
  });

  it('instantiates failure detectors', () => {
    expect(() => new DefaultFailureDetector()).not.toThrow();

    expect(() => new AllErrorsFailureDetectionStrategy()).not.toThrow();

    expect(() => new HttpFailureDetector()).not.toThrow();

    expect(() => new GrpcFailureDetector()).not.toThrow();

    expect(
      () => new CustomFailureDetector({ shouldFail: () => false }),
    ).not.toThrow();

    expect(
      () =>
        new CompositeFailureDetector({
          mode: 'ANY',
          detectors: [new DefaultFailureDetector()],
        }),
    ).not.toThrow();
  });

  it('instantiates resilience health registry', () => {
    expect(new ResilienceHealth().isHealthy()).toBe(true);
  });

  it('exposes Nest-style method decorators as functions', () => {
    expect(typeof WithCircuitBreaker).toBe('function');
    expect(typeof WithRetry).toBe('function');
    expect(typeof WithTimeout).toBe('function');
  });

  it('exposes error classes', () => {
    expect(new CircuitOpenError('smoke', 0)).toBeInstanceOf(CircuitOpenError);

    expect(new TimeoutError(100)).toBeInstanceOf(TimeoutError);

    expect(new BulkheadFullError(1)).toBeInstanceOf(BulkheadFullError);

    expect(new MaxRetriesExceededError(1, new Error('x'))).toBeInstanceOf(
      MaxRetriesExceededError,
    );
  });
});
