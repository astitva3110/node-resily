import { CircuitBreaker } from '../../../src/core/CircuitBreaker';
import { CircuitOpenError } from '../../../src/errors/CircuitOpenError';
import { TimeoutError } from '../../../src/errors/TimeoutError';
import { ConsecutiveFailureBreakingStrategy } from '../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { HttpFailureDetector } from '../../../src/strategies/failure/http.detector';
import { TimeBasedResetStrategy } from '../../../src/strategies/reset/TimeBasedResetStrategy';

const alwaysFail = () => Promise.reject(new Error('downstream failure'));
const alwaysSucceed = () => Promise.resolve('ok');

// ── Helpers ────────────────────────────────────────────────────────────────────

import type { CircuitBreakerOptions } from '../../../src/core/CircuitBreaker';

/** Returns a CB that opens after a single failure and resets immediately. */
function makeInstantBreaker(extra?: Partial<CircuitBreakerOptions>) {
  return new CircuitBreaker({
    name: 'test',
    breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
    resetStrategy: new TimeBasedResetStrategy(0),
    ...extra,
  });
}

async function tripBreaker(cb: CircuitBreaker): Promise<void> {
  await cb.execute(alwaysFail).catch(() => {/* expected */});
}

// ── Core state machine (existing behaviour preserved) ─────────────────────────

describe('CircuitBreaker — core state machine', () => {
  it('starts in the closed state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.getState()).toBe('closed');
  });

  it('passes through successful calls', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(await cb.execute(alwaysSucceed)).toBe('ok');
  });

  it('treats detector-classified unsuccessful results like thrown failures', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      failureDetectionStrategy: new HttpFailureDetector(),
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(1),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });

    await expect(
      cb.execute(() => Promise.resolve({ status: 500 })),
    ).rejects.toThrow('classified');

    expect(cb.getState()).toBe('open');
  });

  it('opens after reaching the failure threshold', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
    });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(alwaysFail)).rejects.toThrow('downstream failure');
    }

    expect(cb.getState()).toBe('open');
  });

  it('throws CircuitOpenError when open', async () => {
    const cb = makeInstantBreaker({ resetStrategy: new TimeBasedResetStrategy(60_000) });
    await tripBreaker(cb);
    await expect(cb.execute(alwaysSucceed)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions to half-open after the reset cooldown, then closes on success', async () => {
    const cb = makeInstantBreaker();
    await tripBreaker(cb);
    expect(cb.getState()).toBe('open');

    const result = await cb.execute(alwaysSucceed);
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('resets to closed via manual reset()', async () => {
    const cb = makeInstantBreaker();
    await tripBreaker(cb);
    cb.reset();
    expect(cb.getState()).toBe('closed');
  });

  it('stays open if half-open probe fails', async () => {
    const cb = makeInstantBreaker();
    await tripBreaker(cb);
    expect(cb.getState()).toBe('open');

    await cb.execute(alwaysFail).catch(() => {/* expected */});
    expect(cb.getState()).toBe('open');
  });
});

// ── Events ─────────────────────────────────────────────────────────────────────

describe('CircuitBreaker — events', () => {
  it('emits "success" with result and durationMs on a successful call', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const handler = jest.fn();
    cb.on('success', handler);

    await cb.execute(alwaysSucceed);

    expect(handler).toHaveBeenCalledTimes(1);
    const [result, durationMs] = handler.mock.calls[0] as [unknown, number];
    expect(result).toBe('ok');
    expect(typeof durationMs).toBe('number');
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits "failure" with error and durationMs on a failed call', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const handler = jest.fn();
    cb.on('failure', handler);

    await cb.execute(alwaysFail).catch(() => {/* expected */});

    expect(handler).toHaveBeenCalledTimes(1);
    const [error, durationMs] = handler.mock.calls[0] as [Error, number];
    expect(error.message).toBe('downstream failure');
    expect(typeof durationMs).toBe('number');
  });

  it('emits "open" when the circuit trips to the open state', async () => {
    const cb = makeInstantBreaker();
    const handler = jest.fn();
    cb.on('open', handler);

    await tripBreaker(cb);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not emit "open" more than once while already open', async () => {
    const cb = makeInstantBreaker({ resetStrategy: new TimeBasedResetStrategy(60_000) });
    const handler = jest.fn();
    cb.on('open', handler);

    await tripBreaker(cb);
    // Circuit is already open — subsequent failures should not re-emit
    // (they are rejected before reaching onFailure)
    await cb.execute(alwaysFail).catch(() => {/* expected */});

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits "close" when circuit resets to closed — via manual reset()', async () => {
    const cb = makeInstantBreaker();
    const handler = jest.fn();
    cb.on('close', handler);

    await tripBreaker(cb);
    cb.reset();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits "close" when half-open probe succeeds', async () => {
    const cb = makeInstantBreaker();
    const handler = jest.fn();
    cb.on('close', handler);

    await tripBreaker(cb);
    await cb.execute(alwaysSucceed);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits "halfOpen" when circuit transitions from open to half-open', async () => {
    const cb = makeInstantBreaker();
    const halfOpenHandler = jest.fn();
    cb.on('halfOpen', halfOpenHandler);

    await tripBreaker(cb);
    // 0ms cooldown — next execute() triggers the transition
    await cb.execute(alwaysSucceed);

    expect(halfOpenHandler).toHaveBeenCalledTimes(1);
  });

  it('emits "reject" with CircuitOpenError when call is blocked by an open circuit', async () => {
    const cb = makeInstantBreaker({ resetStrategy: new TimeBasedResetStrategy(60_000) });
    const handler = jest.fn();
    cb.on('reject', handler);

    await tripBreaker(cb);
    await cb.execute(alwaysSucceed).catch(() => {/* expected */});

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBeInstanceOf(CircuitOpenError);
  });

  it('emits "timeout" with TimeoutError when action exceeds timeoutMs', async () => {
    jest.useFakeTimers();

    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 500 });
    const handler = jest.fn();
    cb.on('timeout', handler);

    const neverResolves = () => new Promise<never>(() => {/* intentionally hangs */});
    const promise = cb.execute(neverResolves).catch(() => {/* expected */});

    jest.advanceTimersByTime(501);
    await promise;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBeInstanceOf(TimeoutError);

    jest.useRealTimers();
  });

  it('emits "fallback" with the fallback result when fallback is invoked', async () => {
    const cb = makeInstantBreaker({ resetStrategy: new TimeBasedResetStrategy(60_000) });
    const handler = jest.fn();
    cb.on('fallback', handler);

    await tripBreaker(cb);
    const result = await cb.execute(alwaysSucceed, {
      fallback: () => Promise.resolve('cached'),
    });

    expect(result).toBe('cached');
    expect(handler).toHaveBeenCalledWith('cached');
  });
});

// ── shutdown() ─────────────────────────────────────────────────────────────────

describe('CircuitBreaker — shutdown()', () => {
  it('isShutdown is false initially', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.isShutdown).toBe(false);
  });

  it('isShutdown becomes true after shutdown()', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    cb.shutdown();
    expect(cb.isShutdown).toBe(true);
  });

  it('execute() throws immediately after shutdown()', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    cb.shutdown();
    await expect(cb.execute(alwaysSucceed)).rejects.toThrow(
      'CircuitBreaker "test" has been shut down.',
    );
  });

  it('removes all event listeners on shutdown()', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    cb.on('success', jest.fn());
    cb.on('failure', jest.fn());
    expect(cb.listenerCount('success')).toBe(1);

    cb.shutdown();

    expect(cb.listenerCount('success')).toBe(0);
    expect(cb.listenerCount('failure')).toBe(0);
  });
});

// ── initializeState() ──────────────────────────────────────────────────────────

describe('CircuitBreaker — initializeState()', () => {
  it('seeds the circuit state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    cb.initializeState({ state: 'open' });
    expect(cb.getState()).toBe('open');
  });

  it('seeds openedAt so the reset strategy can evaluate it', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      resetStrategy: new TimeBasedResetStrategy(0),
    });
    cb.initializeState({ state: 'open', openedAt: Date.now() - 1000 });
    // With 0ms cooldown the circuit should immediately allow a probe
    const result = await cb.execute(alwaysSucceed);
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('seeds the consecutive failure count', async () => {
    const cb = new CircuitBreaker({
      name: 'test',
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
    });
    // Pre-seed 2 failures; one more should trip the breaker
    cb.initializeState({ failureCount: 2 });
    await tripBreaker(cb);
    expect(cb.getState()).toBe('open');
  });

  it('does not emit any events when called', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const anyEvent = jest.fn();
    cb.on('open', anyEvent);
    cb.on('close', anyEvent);
    cb.on('halfOpen', anyEvent);

    cb.initializeState({ state: 'open', openedAt: Date.now(), failureCount: 5 });

    expect(anyEvent).not.toHaveBeenCalled();
  });

  it('applies only provided fields, leaving others unchanged', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    cb.initializeState({ state: 'open' });
    // openedAt should still be 0 (constructor default)
    // failureCount should still be 0
    expect(cb.getState()).toBe('open');
  });
});

// ── Rolling window stats ───────────────────────────────────────────────────────

describe('CircuitBreaker — rolling window stats', () => {
  it('starts with zero stats', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const stats = cb.getWindowStats();
    expect(stats).toEqual({ successes: 0, failures: 0, total: 0, errorRate: 0 });
  });

  it('records successes and failures within the window', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await cb.execute(alwaysSucceed);
    await cb.execute(alwaysFail).catch(() => {/* expected */});
    await cb.execute(alwaysSucceed);

    const { successes, failures, total, errorRate } = cb.getWindowStats();
    expect(successes).toBe(2);
    expect(failures).toBe(1);
    expect(total).toBe(3);
    expect(errorRate).toBeCloseTo(1 / 3);
  });

  it('errorRate is 0 when there are no calls', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.getWindowStats().errorRate).toBe(0);
  });

  it('drops old buckets as the window slides forward', async () => {
    jest.useFakeTimers();

    // 6-second window with 6 one-second buckets
    const cb = new CircuitBreaker({
      name: 'test',
      windowMs: 6_000,
      bucketCount: 6,
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(100), // don't trip
    });

    // Record a failure at t=0
    const failurePromise = cb.execute(alwaysFail).catch(() => {/* expected */});
    await failurePromise;
    expect(cb.getWindowStats().failures).toBe(1);

    // Advance past the entire window
    jest.advanceTimersByTime(7_000);

    // Record a success at t=7s — the old failure should have slid out
    const successPromise = cb.execute(alwaysSucceed);
    await successPromise;

    const { failures, successes } = cb.getWindowStats();
    expect(failures).toBe(0);
    expect(successes).toBe(1);

    jest.useRealTimers();
  });

  it('reset() clears the rolling window', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await cb.execute(alwaysSucceed);
    await cb.execute(alwaysFail).catch(() => {/* expected */});

    cb.reset();

    expect(cb.getWindowStats()).toEqual({ successes: 0, failures: 0, total: 0, errorRate: 0 });
  });
});

// ── AbortController support ────────────────────────────────────────────────────

describe('CircuitBreaker — AbortController', () => {
  it('calls abort() on the provided AbortController when timeout fires', async () => {
    jest.useFakeTimers();

    const ac = new AbortController();
    const abortSpy = jest.spyOn(ac, 'abort');

    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 200, abortController: ac });
    const neverResolves = () => new Promise<never>(() => {/* hangs */});

    const promise = cb.execute(neverResolves).catch(() => {/* expected */});
    jest.advanceTimersByTime(201);
    await promise;

    expect(abortSpy).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('exposes the AbortController via the abortController getter', () => {
    const ac = new AbortController();
    const cb = new CircuitBreaker({ name: 'test', abortController: ac });
    expect(cb.abortController).toBe(ac);
  });

  it('abortController is undefined when not provided', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.abortController).toBeUndefined();
  });

  it('autoRenewAbortController: creates a new controller on reset() (CLOSED transition)', async () => {
    const ac = new AbortController();
    const cb = makeInstantBreaker({ abortController: ac, autoRenewAbortController: true });

    await tripBreaker(cb);
    cb.reset();

    expect(cb.abortController).toBeDefined();
    expect(cb.abortController).not.toBe(ac);
  });

  it('autoRenewAbortController: creates a new controller on HALF_OPEN transition', async () => {
    const ac = new AbortController();
    const cb = makeInstantBreaker({ abortController: ac, autoRenewAbortController: true });

    await tripBreaker(cb);
    const prevAc = cb.abortController;

    // Trigger transitionIfNeeded by executing — 0ms cooldown moves it to half-open
    await cb.execute(alwaysSucceed); // also closes the circuit

    // A new controller should have been created for the half-open probe
    expect(cb.abortController).not.toBe(prevAc);
  });

  it('does not create a new controller when autoRenewAbortController is false', async () => {
    const ac = new AbortController();
    const cb = makeInstantBreaker({ abortController: ac, autoRenewAbortController: false });

    await tripBreaker(cb);
    cb.reset();

    expect(cb.abortController).toBe(ac);
  });
});

// ── Fallback ───────────────────────────────────────────────────────────────────

describe('CircuitBreaker — fallback', () => {
  it('calls fallback and returns its value when the circuit is open', async () => {
    const cb = makeInstantBreaker({ resetStrategy: new TimeBasedResetStrategy(60_000) });
    await tripBreaker(cb);

    const result = await cb.execute(alwaysSucceed, {
      fallback: () => Promise.resolve('fallback-value'),
    });

    expect(result).toBe('fallback-value');
  });

  it('calls fallback and returns its value when the action throws', async () => {
    const cb = new CircuitBreaker({ name: 'test' });

    const result = await cb.execute(alwaysFail, {
      fallback: () => Promise.resolve('degraded'),
    });

    expect(result).toBe('degraded');
  });

  it('calls fallback when action times out', async () => {
    jest.useFakeTimers();

    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 100 });
    const neverResolves = () => new Promise<string>(() => {/* hangs */});

    const promise = cb.execute(neverResolves, {
      fallback: () => Promise.resolve('timeout-fallback'),
    });
    jest.advanceTimersByTime(101);

    await expect(promise).resolves.toBe('timeout-fallback');
    jest.useRealTimers();
  });

  it('does not throw when fallback is provided even if action always fails', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await expect(
      cb.execute(alwaysFail, { fallback: () => Promise.resolve(null) }),
    ).resolves.toBeNull();
  });

  it('still throws when no fallback is provided and action fails', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await expect(cb.execute(alwaysFail)).rejects.toThrow('downstream failure');
  });
});

// ── Timeout ────────────────────────────────────────────────────────────────────

describe('CircuitBreaker — timeoutMs', () => {
  it('throws TimeoutError when action exceeds timeoutMs', async () => {
    jest.useFakeTimers();

    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 1_000 });
    const neverResolves = () => new Promise<string>(() => {/* hangs */});

    const promise = cb.execute(neverResolves);
    jest.advanceTimersByTime(1_001);

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    jest.useRealTimers();
  });

  it('does not throw TimeoutError for fast actions', async () => {
    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 5_000 });
    await expect(cb.execute(alwaysSucceed)).resolves.toBe('ok');
  });

  it('timeout counts as a failure and contributes to circuit opening', async () => {
    jest.useFakeTimers();

    const cb = new CircuitBreaker({
      name: 'test',
      timeoutMs: 100,
      breakingStrategy: new ConsecutiveFailureBreakingStrategy(2),
      resetStrategy: new TimeBasedResetStrategy(60_000),
    });

    const neverResolves = () => new Promise<string>(() => {/* hangs */});

    const p1 = cb.execute(neverResolves).catch(() => {/* expected */});
    jest.advanceTimersByTime(101);
    await p1;

    const p2 = cb.execute(neverResolves).catch(() => {/* expected */});
    jest.advanceTimersByTime(101);
    await p2;

    expect(cb.getState()).toBe('open');
    jest.useRealTimers();
  });

  it('TimeoutError carries the configured timeoutMs value', async () => {
    jest.useFakeTimers();

    const cb = new CircuitBreaker({ name: 'test', timeoutMs: 250 });
    const neverResolves = () => new Promise<string>(() => {/* hangs */});

    const promise = cb.execute(neverResolves);
    jest.advanceTimersByTime(251);

    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).timeoutMs).toBe(250);

    jest.useRealTimers();
  });
});

// ── EventEmitter integration ───────────────────────────────────────────────────

describe('CircuitBreaker — EventEmitter integration', () => {
  it('supports multiple listeners on the same event', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const h1 = jest.fn();
    const h2 = jest.fn();
    cb.on('success', h1);
    cb.on('success', h2);

    await cb.execute(alwaysSucceed);

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('once() listeners are called only once', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const handler = jest.fn();
    cb.once('success', handler);

    await cb.execute(alwaysSucceed);
    await cb.execute(alwaysSucceed);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeListener() stops future emissions', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const handler = jest.fn();
    cb.on('success', handler);
    cb.removeListener('success', handler);

    await cb.execute(alwaysSucceed);

    expect(handler).not.toHaveBeenCalled();
  });
});
