import { EventEmitter } from 'events';
import { CircuitOpenError } from '../errors/CircuitOpenError';
import { TimeoutError } from '../errors/TimeoutError';
import type {
  BreakingStrategyContext,
  BreakingWindowSnapshot,
  IBreakingStrategy,
} from '../interfaces/IBreakingStrategy';
import type { IFailureDetector } from '../interfaces/IFailureDetectionStrategy';
import type { IResetStrategy, ResetStrategyContext } from '../interfaces/IResetStrategy';
import { DefaultFailureDetector } from '../strategies/failure/default.detector';
import { ConsecutiveFailureBreakingStrategy } from '../strategies/breaking/ConsecutiveFailureBreakingStrategy';
import { TimeBasedResetStrategy } from '../strategies/reset/TimeBasedResetStrategy';

/** Possible states of the circuit breaker. */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Snapshot of circuit breaker statistics used to seed state from external
 * storage (e.g. Redis) in serverless environments.
 */
export interface ICircuitStats {
  /** Current circuit state. */
  state?: CircuitState;
  /** Number of consecutive failures at the time of the snapshot. */
  failureCount?: number;
  /** Timestamp (ms since epoch) when the circuit last opened. */
  openedAt?: number;
}

/** Rolling-window statistics returned by {@link CircuitBreaker.getWindowStats}. */
export interface WindowStats {
  /** Number of successful calls recorded in the current window. */
  successes: number;
  /** Number of failed calls recorded in the current window. */
  failures: number;
  /** Total calls in the current window. */
  total: number;
  /** Fraction of calls that failed — a value in [0, 1]. */
  errorRate: number;
}

/** A single time-bucket in the rolling stats window. */
interface StatsBucket {
  startMs: number;
  successes: number;
  failures: number;
}

/** Options for constructing a {@link CircuitBreaker}. */
export interface CircuitBreakerOptions {
  /** Human-readable name used in error messages and observability. */
  name: string;
  /** Strategy that decides when to open the circuit. Defaults to 5 consecutive failures. */
  breakingStrategy?: IBreakingStrategy;
  /** Strategy that decides when to attempt recovery. Defaults to 30 s cooldown. */
  resetStrategy?: IResetStrategy;
  /** Classifies failures and successful return values when determining circuit health. */
  failureDetectionStrategy?: IFailureDetector;
  /**
   * Maximum time in milliseconds an action may run before a {@link TimeoutError} is
   * thrown and `abortController.abort()` is called.
   */
  timeoutMs?: number;
  /**
   * External AbortController whose signal callers can pass to fetch/axios etc.
   * The circuit breaker calls `abort()` when `timeoutMs` is exceeded.
   */
  abortController?: AbortController;
  /**
   * When `true`, a fresh `AbortController` is created automatically whenever the
   * circuit transitions to CLOSED or HALF_OPEN, replacing the previous controller.
   *
   * @default false
   */
  autoRenewAbortController?: boolean;
  /**
   * Total duration of the rolling statistics window in milliseconds.
   *
   * @default 60_000
   */
  windowMs?: number;
  /**
   * Number of time buckets the window is divided into.
   * Each bucket covers `windowMs / bucketCount` milliseconds.
   *
   * @default 10
   */
  bucketCount?: number;
}

/** Per-call options accepted by {@link CircuitBreaker.execute}. */
export interface ExecuteOptions<T> {
  /**
   * Fallback factory invoked whenever the action cannot complete — either because
   * the circuit is open, the action throws, or a timeout occurs. Its return value
   * is emitted as the `'fallback'` event payload and returned to the caller.
   */
  fallback?: () => Promise<T>;
}

/**
 * A pluggable circuit breaker that wraps async operations and short-circuits
 * calls when a downstream dependency is unhealthy.
 *
 * Extends `EventEmitter`; subscribe to the following events:
 *
 * | Event       | Payload                          | Description                                      |
 * |-------------|----------------------------------|--------------------------------------------------|
 * | `open`      | —                                | Circuit transitioned to OPEN                     |
 * | `close`     | —                                | Circuit transitioned to CLOSED                   |
 * | `halfOpen`  | —                                | Circuit transitioned to HALF_OPEN                |
 * | `reject`    | `CircuitOpenError`               | Call rejected because circuit is OPEN            |
 * | `timeout`   | `TimeoutError`                   | Action exceeded `timeoutMs`                      |
 * | `fallback`  | `result`                         | Fallback was invoked; carries the fallback result |
 * | `success`   | `result, durationMs`             | Action completed successfully                    |
 * | `failure`   | `error, durationMs`              | Action failed                                    |
 *
 * @example
 * ```ts
 * const cb = new CircuitBreaker({ name: 'payments-service', timeoutMs: 3_000 });
 *
 * cb.on('open',    ()          => metrics.increment('circuit.open'));
 * cb.on('success', (_, ms)    => metrics.timing('latency', ms));
 * cb.on('failure', (err)      => logger.warn(err));
 *
 * const result = await cb.execute(() => fetch('/api/charge'), {
 *   fallback: () => Promise.resolve(cachedValue),
 * });
 * ```
 */
export class CircuitBreaker extends EventEmitter {
  // ── State ──────────────────────────────────────────────────────────────────
  private _state: CircuitState = 'closed';
  private _openedAt = 0;
  /** Timestamp (ms epoch) of the last counted breaking failure; `0` if none occurred. */
  private _lastBreakingFailureAt = 0;
  private _isShutdown = false;
  /** Consecutive failure counter — reset to 0 on any successful execution. */
  private consecutiveFailureCount = 0;

  // ── Strategies ─────────────────────────────────────────────────────────────
  private readonly _name: string;
  private readonly breakingStrategy: IBreakingStrategy;
  private readonly resetStrategy: IResetStrategy;
  private readonly failureDetectionStrategy: IFailureDetector;

  // ── Timeout / AbortController ───────────────────────────────────────────────
  private readonly timeoutMs?: number;
  private readonly _autoRenewAbortController: boolean;
  private _abortController?: AbortController;

  // ── Rolling window stats ───────────────────────────────────────────────────
  private readonly windowMs: number;
  private readonly bucketCount: number;
  private readonly bucketDurationMs: number;
  private buckets: StatsBucket[];
  private currentBucketIndex: number;

  constructor(options: CircuitBreakerOptions) {
    super();
    this._name = options.name;
    this.breakingStrategy =
      options.breakingStrategy ?? new ConsecutiveFailureBreakingStrategy(5);
    this.resetStrategy =
      options.resetStrategy ?? new TimeBasedResetStrategy(30_000);
    this.failureDetectionStrategy =
      options.failureDetectionStrategy ?? new DefaultFailureDetector();
    this.timeoutMs = options.timeoutMs;
    this._abortController = options.abortController;
    this._autoRenewAbortController = options.autoRenewAbortController ?? false;
    this.windowMs = options.windowMs ?? 60_000;
    this.bucketCount = options.bucketCount ?? 10;
    this.bucketDurationMs = this.windowMs / this.bucketCount;
    this.buckets = CircuitBreaker.makeBuckets(this.bucketCount, this.bucketDurationMs);
    this.currentBucketIndex = this.bucketCount - 1;
  }

  // ── Public getters ─────────────────────────────────────────────────────────

  /** Returns the current state of the circuit. */
  getState(): CircuitState {
    return this._state;
  }

  /**
   * The `name` from {@link CircuitBreakerOptions}; used when registering breakers with
   * health aggregators and in error messages.
   */
  get name(): string {
    return this._name;
  }

  /**
   * Counted consecutive failures since the last successful execution (breaker bookkeeping).
   *
   * @see {@link getWindowStats} for rolling-window aggregates.
   */
  getConsecutiveFailureCount(): number {
    return this.consecutiveFailureCount;
  }

  /**
   * Timestamp (ms epoch) of the last **counted** breaking failure recorded by this breaker,
   * or `0` if none have occurred yet in this process.
   */
  getLastBreakingFailureAt(): number {
    return this._lastBreakingFailureAt;
  }

  /** `true` after {@link shutdown} has been called; subsequent `execute` calls throw immediately. */
  get isShutdown(): boolean {
    return this._isShutdown;
  }

  /**
   * The current `AbortController` instance.
   * When `autoRenewAbortController` is `true` this reference is updated on every
   * CLOSED / HALF_OPEN transition.
   */
  get abortController(): AbortController | undefined {
    return this._abortController;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Executes `action` inside the circuit breaker.
   *
   * - Throws {@link CircuitOpenError} (or calls `options.fallback`) when the circuit is OPEN.
   * - Throws {@link TimeoutError} (or calls `options.fallback`) when `timeoutMs` is exceeded.
   * - On timeout, calls `abortController.abort()` if an AbortController is configured.
   *
   * @param action  - Async factory for the protected operation.
   * @param options - Optional per-call settings (fallback factory).
   * @returns The result of `action`, or the return value of `fallback` when provided.
   *
   * @example
   * ```ts
   * const data = await cb.execute(() => fetchUser(id), {
   *   fallback: () => Promise.resolve(defaultUser),
   * });
   * ```
   */
  async execute<T>(action: () => Promise<T>, options?: ExecuteOptions<T>): Promise<T> {
    if (this._isShutdown) {
      throw new Error(`CircuitBreaker "${this._name}" has been shut down.`);
    }

    this.transitionIfNeeded();

    if (this._state === 'open') {
      const err = new CircuitOpenError(this._name, this._openedAt);
      this.emit('reject', err);
      return this.resolveFallback(options?.fallback, err);
    }

    const start = Date.now();

    try {
      const result = await this.runAction(action);
      const durationMs = Date.now() - start;

      this.breakingStrategy.afterInvoke(durationMs);

      if (!this.failureDetectionStrategy.isSuccess(result)) {
        const error = new Error(
          'Protected operation returned a result classified as a circuit failure.',
        );
        return this.finalizeBreakingInvocation(durationMs, error, true, options);
      }

      this.applyBreakingDecision({
        consecutiveFailures: this.consecutiveFailureCount,
        windowStats: this.breakingWindowSnapshot(),
        durationMs,
        countedAsBreakingFailure: false,
      });

      this.recordOperationalSuccess();
      this.emit('success', result, durationMs);

      return result;
    } catch (raw: unknown) {
      const durationMs = Date.now() - start;
      const error = raw instanceof Error ? raw : new Error(String(raw));

      this.breakingStrategy.afterInvoke(durationMs);

      const countedBreakingFailure = this.failureDetectionStrategy.isFailure(error);

      return this.finalizeBreakingInvocation(
        durationMs,
        error,
        countedBreakingFailure,
        options,
      );
    }
  }

  /**
   * Manually resets the circuit to the CLOSED state and emits `'close'`.
   * Useful for administrative recovery or testing.
   */
  reset(): void {
    this.resetStrategy.onCircuitRecovered?.();
    this._state = 'closed';
    this._openedAt = 0;
    this._lastBreakingFailureAt = 0;
    this.consecutiveFailureCount = 0;
    this.breakingStrategy.reset();
    this.buckets = CircuitBreaker.makeBuckets(this.bucketCount, this.bucketDurationMs);
    this.currentBucketIndex = this.bucketCount - 1;
    this.emit('close');
    if (this._autoRenewAbortController) {
      this._abortController = new AbortController();
    }
  }

  /**
   * Permanently disables this circuit breaker and removes all event listeners.
   * Subsequent calls to {@link execute} throw immediately.
   *
   * @example
   * ```ts
   * // Graceful shutdown
   * process.on('SIGTERM', () => cb.shutdown());
   * ```
   */
  shutdown(): void {
    this._isShutdown = true;
    this.removeAllListeners();
  }

  /**
   * Seeds the circuit breaker state from a persisted snapshot.
   *
   * Intended for serverless environments where the breaker is recreated on every
   * cold start and state must be restored from external storage (e.g. Redis).
   * Does **not** emit any events.
   *
   * @param state - Partial snapshot; only provided fields are applied.
   *
   * @example
   * ```ts
   * const raw = await redis.get('cb:payments');
   * if (raw) cb.initializeState(JSON.parse(raw));
   * ```
   */
  initializeState(state: Partial<ICircuitStats>): void {
    if (state.state !== undefined) {
      this._state = state.state;
    }
    if (state.openedAt !== undefined) {
      this._openedAt = state.openedAt;
    }
    if (state.failureCount !== undefined) {
      this.consecutiveFailureCount = state.failureCount;
    }
  }

  /**
   * Returns aggregated statistics from the current rolling window.
   *
   * The window covers the last `windowMs` milliseconds divided into `bucketCount`
   * buckets; each bucket is `windowMs / bucketCount` milliseconds wide. Buckets
   * outside the window are excluded automatically.
   *
   * @example
   * ```ts
   * const { errorRate } = cb.getWindowStats();
   * if (errorRate > 0.5) alert('high error rate');
   * ```
   */
  getWindowStats(): WindowStats {
    const windowStart = Date.now() - this.windowMs;
    let successes = 0;
    let failures = 0;

    for (const bucket of this.buckets) {
      if (bucket.startMs >= windowStart) {
        successes += bucket.successes;
        failures += bucket.failures;
      }
    }

    const total = successes + failures;
    return {
      successes,
      failures,
      total,
      errorRate: total > 0 ? failures / total : 0,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static makeBuckets(count: number, bucketDurationMs: number): StatsBucket[] {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      startMs: now - (count - 1 - i) * bucketDurationMs,
      successes: 0,
      failures: 0,
    }));
  }

  /**
   * Returns the bucket that covers `Date.now()`, advancing the ring buffer
   * and zeroing stale buckets as needed.
   */
  private currentBucket(): StatsBucket {
    const now = Date.now();
    let bucket = this.buckets[this.currentBucketIndex];

    while (now - bucket.startMs >= this.bucketDurationMs) {
      this.currentBucketIndex = (this.currentBucketIndex + 1) % this.bucketCount;
      this.buckets[this.currentBucketIndex] = {
        startMs: bucket.startMs + this.bucketDurationMs,
        successes: 0,
        failures: 0,
      };
      bucket = this.buckets[this.currentBucketIndex];
    }

    return bucket;
  }

  private transitionIfNeeded(): void {
    if (this._state !== 'open') {
      return;
    }

    const resetContext: ResetStrategyContext = {
      lastBreakingFailureAt:
        this._lastBreakingFailureAt > 0
          ? this._lastBreakingFailureAt
          : this._openedAt,
    };

    if (this.resetStrategy.shouldReset(this._openedAt, resetContext)) {
      this._state = 'half-open';
      this.emit('halfOpen');
      if (this._autoRenewAbortController) {
        this._abortController = new AbortController();
      }
    }
  }

  private breakingWindowSnapshot(): BreakingWindowSnapshot {
    const snapshot = this.getWindowStats();

    return {
      successes: snapshot.successes,
      failures: snapshot.failures,
      total: snapshot.total,
      errorRate: snapshot.errorRate,
    };
  }

  /**
   * Promotes to OPEN when strategies demand it — separate from rejecting calls once already open.
   */
  private applyBreakingDecision(context: BreakingStrategyContext): void {
    /* istanbul ignore if — guarded for concurrent executions that trip the breaker elsewhere */
    if (this._state === 'open') {
      return;
    }

    if (!this.breakingStrategy.shouldOpen(context)) {
      return;
    }

    this._state = 'open';
    this._openedAt = Date.now();
    this.emit('open');
  }

  private recordOperationalSuccess(): void {
    this.currentBucket().successes++;
    this.consecutiveFailureCount = 0;

    if (this._state === 'half-open') {
      this.reset();
    }
  }

  /**
   * Emits `'failure'` (and `'timeout'` for timeouts) plus applies fallback bookkeeping.
   */
  private async finalizeBreakingInvocation<T>(
    durationMs: number,
    error: Error,
    countedBreakingFailure: boolean,
    options?: ExecuteOptions<T>,
  ): Promise<T> {
    if (countedBreakingFailure) {
      this.currentBucket().failures++;
      this.consecutiveFailureCount++;
      this._lastBreakingFailureAt = Date.now();
      this.resetStrategy.onBreakingFailure?.();
    }

    this.applyBreakingDecision({
      consecutiveFailures: this.consecutiveFailureCount,
      windowStats: this.breakingWindowSnapshot(),
      durationMs,
      countedAsBreakingFailure: countedBreakingFailure,
      error,
    });

    if (error instanceof TimeoutError) {
      this.emit('timeout', error);
    }

    this.emit('failure', error, durationMs);

    return this.resolveFallback(options?.fallback, error);
  }

  private async runAction<T>(action: () => Promise<T>): Promise<T> {
    if (this.timeoutMs === undefined) {
      return action();
    }

    const { timeoutMs } = this;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._abortController?.abort();
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);

      action().then(
        (result) => { clearTimeout(timer); resolve(result); },
        (err: unknown) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  private async resolveFallback<T>(
    fallback: (() => Promise<T>) | undefined,
    originalError: Error,
  ): Promise<T> {
    if (fallback !== undefined) {
      const result = await fallback();
      this.emit('fallback', result);
      return result;
    }
    throw originalError;
  }
}
