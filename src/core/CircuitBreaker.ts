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

/** Breaker lifecycle state. */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Persisted snapshot for cold-start restore (e.g. external store). */
export interface ICircuitStats {
  state?: CircuitState;
  failureCount?: number;
  openedAt?: number;
}

/** Rolling-window aggregates from {@link CircuitBreaker.getWindowStats}. */
export interface WindowStats {
  successes: number;
  failures: number;
  total: number;
  errorRate: number;
}

interface StatsBucket {
  startMs: number;
  successes: number;
  failures: number;
}

/** Constructor options for {@link CircuitBreaker}. */
export interface CircuitBreakerOptions {
  name: string;
  breakingStrategy?: IBreakingStrategy;
  resetStrategy?: IResetStrategy;
  failureDetectionStrategy?: IFailureDetector;
  timeoutMs?: number;
  abortController?: AbortController;
  autoRenewAbortController?: boolean;
  windowMs?: number;
  bucketCount?: number;
}

/** Per-call options for {@link CircuitBreaker.execute}. */
export interface ExecuteOptions<T> {
  fallback?: () => Promise<T>;
}

/**
 * Async circuit breaker with pluggable strategies; emits `open` / `close` / `halfOpen` / `success` / `failure` / `timeout` / `fallback` / `reject`.
 */
export class CircuitBreaker extends EventEmitter {
  private _state: CircuitState = 'closed';
  private _openedAt = 0;
  private _lastBreakingFailureAt = 0;
  private _isShutdown = false;
  /** Serializes probes so at most one `execute` runs while half-open. */
  private _halfOpenProbeInFlight = false;
  private consecutiveFailureCount = 0;

  private readonly _name: string;
  private readonly breakingStrategy: IBreakingStrategy;
  private readonly resetStrategy: IResetStrategy;
  private readonly failureDetectionStrategy: IFailureDetector;

  private readonly timeoutMs?: number;
  private readonly _autoRenewAbortController: boolean;
  private _abortController?: AbortController;

  private readonly windowMs: number;
  private readonly bucketCount: number;
  private readonly bucketDurationMs: number;
  private buckets: StatsBucket[];
  private currentBucketIndex: number;

  /** Builds a breaker with optional strategies, timeouts, and rolling-window tuning. */
  constructor(options: CircuitBreakerOptions) {
    super();
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive number');
    }
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

  /** Current `closed` / `open` / `half-open` state. */
  getState(): CircuitState {
    return this._state;
  }

  /** Stable id for logs, health, and {@link CircuitOpenError}. */
  get name(): string {
    return this._name;
  }

  /** Consecutive breaking failures since the last success (not the rolling window). */
  getConsecutiveFailureCount(): number {
    return this.consecutiveFailureCount;
  }

  /** Epoch ms of the last counted breaking failure, or `0`. */
  getLastBreakingFailureAt(): number {
    return this._lastBreakingFailureAt;
  }

  /** After {@link shutdown}, `execute` throws immediately. */
  get isShutdown(): boolean {
    return this._isShutdown;
  }

  /** Optional controller aborted on timeout; renewed when `autoRenewAbortController` and state changes. */
  get abortController(): AbortController | undefined {
    return this._abortController;
  }

  /** Runs `action` through the breaker (timeout, detector, fallback, events). */
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

    let halfOpenProbeLock = false;
    if (this._state === 'half-open') {
      if (this._halfOpenProbeInFlight) {
        const err = new CircuitOpenError(this._name, this._openedAt);
        this.emit('reject', err);
        return this.resolveFallback(options?.fallback, err);
      }
      this._halfOpenProbeInFlight = true;
      halfOpenProbeLock = true;
    }

    try {
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
    } finally {
      if (halfOpenProbeLock) {
        this._halfOpenProbeInFlight = false;
      }
    }
  }

  /** Forces CLOSED and clears counters (admin / tests). */
  reset(): void {
    this.resetStrategy.onCircuitRecovered?.();
    this._state = 'closed';
    this._openedAt = 0;
    this._lastBreakingFailureAt = 0;
    this._halfOpenProbeInFlight = false;
    this.consecutiveFailureCount = 0;
    this.breakingStrategy.reset();
    this.buckets = CircuitBreaker.makeBuckets(this.bucketCount, this.bucketDurationMs);
    this.currentBucketIndex = this.bucketCount - 1;
    this.emit('close');
    if (this._autoRenewAbortController) {
      this._abortController = new AbortController();
    }
  }

  /** Disables the breaker and clears listeners; further `execute` throws. */
  shutdown(): void {
    this._isShutdown = true;
    this.removeAllListeners();
  }

  /** Applies external state without emitting events (serverless / Redis restore). */
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

  /** Rolling-window success/failure counts and fractional error rate. */
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

  private static makeBuckets(count: number, bucketDurationMs: number): StatsBucket[] {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      startMs: now - (count - 1 - i) * bucketDurationMs,
      successes: 0,
      failures: 0,
    }));
  }

  /** Advances the ring buffer so `Date.now()` falls in the active bucket. */
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

  /** Opens the circuit when the strategy demands it (may run while half-open). */
  private applyBreakingDecision(context: BreakingStrategyContext): void {
    /* istanbul ignore if — another path may have opened the circuit concurrently */
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
