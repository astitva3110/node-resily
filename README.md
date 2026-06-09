# node-resily

> Resilience patterns for Node.js microservices — circuit breaker, retry, timeout, and bulkhead with pluggable strategies.

[![npm version](https://img.shields.io/npm/v/node-resily.svg)](https://www.npmjs.com/package/node-resily)
[![npm downloads](https://img.shields.io/npm/dm/node-resily.svg)](https://www.npmjs.com/package/node-resily)
[![CI](https://github.com/astitva3110/node-resily/workflows/CI/badge.svg)](https://github.com/astitva3110/node-resily/actions)
[![coverage](https://img.shields.io/badge/coverage-threshold_≥90%25-2ea44f)](https://github.com/astitva3110/node-resily/blob/main/jest.config.ts)
[![license](https://img.shields.io/npm/l/node-resily.svg)](https://github.com/astitva3110/node-resily/blob/main/package.json)

## The problem

One downstream service starts failing. Callers wait, thread pools fill up, retries amplify load, and the next tier starts timing out. Microservice outages usually look like a slow cascade of pressure and backlogs—not a single switch flipping off.

## Why node-resily

| Feature | opossum | node-resily |
|---------|---------|--------|
| Circuit breaker | ✅ | ✅ |
| EventEmitter events | ✅ | ✅ |
| Rolling window stats | ✅ | ✅ |
| AbortController | ✅ | ✅ |
| Fallback | ✅ | ✅ |
| Retry pattern | ❌ | ✅ |
| Bulkhead pattern | ❌ | ✅ |
| Pluggable breaking strategy | ❌ | ✅ |
| Pluggable reset strategy | ❌ | ✅ |
| Pluggable failure detection | ❌ | ✅ |
| Error-rate based breaking | ❌ | ✅ |
| Slow-call based breaking | ❌ | ✅ |
| gRPC failure detection | ❌ | ✅ |
| Composite failure detection | ❌ | ✅ |
| NestJS decorators | ❌ | ✅ |
| Health monitoring | ❌ | ✅ |
| TypeScript first | ⚠️ types via @types | ✅ native |

Comparison against opossum's shipped feature set. Both are valid tools — pick node-resily when you need pluggable strategies or the additional patterns.

## Installation

```bash
npm install node-resily
```

If you use **NestJS decorators** (`@WithCircuitBreaker`, `@WithRetry`, `@WithTimeout`), install peers your app already needs: `@nestjs/common`, `@nestjs/core`, and `reflect-metadata`.

## Quick start

```ts
import { CircuitBreaker } from 'node-resily';

const breaker = new CircuitBreaker({ name: 'payments', timeoutMs: 3_000 });
const receipt = await breaker.execute(() =>
  paymentService.charge(amount),
);
```

## Circuit breaker

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │   CLOSED ──── threshold breached ──►  OPEN   │
  │     ▲                                  │     │
  │     │                            reset │     │
  │     │                           timeout│     │
  │     │                                  │     │
  │  success                        HALF-OPEN    │
  │     │                           /      \     │
  │     └──── probe succeeds ──────┘        │    │
  │                                         │    │
  │              probe fails ──────────► OPEN    │
  │                                              │
  └──────────────────────────────────────────────┘
```

```ts
import { CircuitBreaker } from 'node-resily';

const breaker = new CircuitBreaker({
  name: 'payment-service',
  timeoutMs: 3_000,
});

breaker.on('open', () => console.log('Circuit opened'));
breaker.on('close', () => console.log('Circuit closed'));

const result = await breaker.execute(
  () => paymentService.charge(amount),
  {
    fallback: async () => ({ status: 'service unavailable' as const }),
  },
);
```

`fallback` is **per call**: pass it in the second argument to `execute()`, not on the breaker constructor.

## Pluggable strategies

The circuit breaker stays small because **when to open**, **when to probe again**, and **what counts as failure** are all strategy objects. Defaults are sane; swap them when your production semantics differ.

### Breaking strategies

Trip the circuit based on consecutive errors, rolling error rate, or “too many slow calls”.

```ts
import {
  ConsecutiveFailureBreakingStrategy,
  ErrorRateBreakingStrategy,
  SlowCallBreakingStrategy,
} from 'node-resily';

// 1. Consecutive failures (default is 5 — pass your own threshold)
new ConsecutiveFailureBreakingStrategy(5);

// 2. Error rate (percentage of failures in the rolling window)
new ErrorRateBreakingStrategy({
  failureRateThreshold: 50,
  minRequestCount: 10,
});

// 3. Slow calls (latency tracked inside the strategy)
new SlowCallBreakingStrategy({
  slowCallDurationThreshold: 2_000,
  slowCallRateThreshold: 50,
  minRequestCount: 10,
});
```

Wire one in with `breakingStrategy` on `CircuitBreaker` options.

### Reset strategies

Control how long the breaker stays **open** before a half-open probe is allowed.

```ts
import { TimeBasedResetStrategy, ExponentialResetStrategy } from 'node-resily';

// Fixed delay (milliseconds)
new TimeBasedResetStrategy(30_000);

// Exponential backoff while the circuit stays open
new ExponentialResetStrategy({
  initialDelayMs: 1_000,
  multiplier: 2,
  maxDelayMs: 60_000,
});
```

### Failure detection

Classify thrown errors **and** successful return values so benign HTTP responses do not reset a breaker that should stay wary.

```ts
import {
  DefaultFailureDetector,
  HttpFailureDetector,
  GrpcFailureDetector,
  CustomFailureDetector,
  CompositeFailureDetector,
  TimeoutError,
} from 'node-resily';

class ValidationError extends Error {
  override name = 'ValidationError';
}

class DatabaseError extends Error {
  override name = 'DatabaseError';
}

// Default — any Error is a failure; any result is success
new DefaultFailureDetector();

// HTTP status codes on errors / response-shaped results
new HttpFailureDetector({
  failOnStatusCodes: [500, 502, 503],
  ignoreStatusCodes: [404, 429],
  ignoreErrors: [ValidationError],
});

// gRPC-style `code` on errors
new GrpcFailureDetector();

// Custom — predicates you own
new CustomFailureDetector({
  shouldFail: (error) => error instanceof DatabaseError,
  shouldSucceed: (result) =>
    typeof result === 'object' && result !== null && (result as { status?: string }).status === 'ok',
});

// Composite — combine detectors (`ANY` / `ALL`)
new CompositeFailureDetector({
  mode: 'ANY',
  detectors: [
    new HttpFailureDetector({ failOnStatusCodes: [500] }),
    new CustomFailureDetector({
      shouldFail: (e) => e instanceof TimeoutError,
    }),
  ],
});
```

Set `failureDetectionStrategy` on the breaker options.

### Bring your own breaking strategy

```ts
import type { BreakingStrategyContext, IBreakingStrategy } from 'node-resily';

class MyBreakingStrategy implements IBreakingStrategy {
  afterInvoke(_durationMs: number): void {}

  shouldOpen(context: BreakingStrategyContext): boolean {
    return context.consecutiveFailures > 10;
  }

  reset(): void {}
}
```

## Retry

Retry strategy is fully pluggable — implement `IRetryStrategy` to define your own backoff logic. Example exponential backoff:

```ts
import { CircuitBreaker, Retry } from 'node-resily';
import type { IRetryStrategy } from 'node-resily';

class ExponentialBackoffStrategy implements IRetryStrategy {
  constructor(
    private readonly baseMs = 100,
    private readonly maxMs = 5_000,
  ) {}

  getDelay(attempt: number): number {
    return Math.min(this.baseMs * 2 ** (attempt - 1), this.maxMs);
  }

  shouldRetry(_error: Error, _attempt: number): boolean {
    return true;
  }
}

const inventoryBreaker = new CircuitBreaker({ name: 'inventory', timeoutMs: 8_000 });
const retry = new Retry({
  maxAttempts: 3,
  strategy: new ExponentialBackoffStrategy(200, 4_000),
});

const stock = await retry.execute(() =>
  inventoryBreaker.execute(() => inventoryClient.getStock(sku)),
);
```

Retries run **around** the breaker: a failing call still counts as one breaker attempt per execution of the inner `execute`.

## Timeout

```ts
import { Timeout } from 'node-resily';

const timeout = new Timeout(5_000);
const report = await timeout.execute(() => reportService.buildQuarterly());
```

This helper races your promise against a timer. It does **not** call `AbortController.abort()`. For cooperative cancellation (e.g. `fetch` with `signal`), use **`CircuitBreaker`** with `timeoutMs` and optionally `abortController` / `autoRenewAbortController`.

## Bulkhead

```ts
import { Bulkhead } from 'node-resily';

const searchBulkhead = new Bulkhead({ maxConcurrent: 8, maxQueueSize: 32 });
const hits = await searchBulkhead.execute(() => searchService.query(q));
```

A bulkhead caps how many concurrent calls may hit a fragile dependency; excess work waits in a queue or fails fast with `BulkheadFullError`.

## NestJS

Requires `experimentalDecorators` and `emitDecoratorMetadata` in `tsconfig`.

@WithCircuitBreaker shares circuit state across all instances of the decorated class — failures on one instance count toward tripping the breaker for all instances. @WithRetry and @WithTimeout share the instance but per-call state is independent — each call gets its own attempt budget.

```ts
import { Injectable } from '@nestjs/common';
import {
  WithCircuitBreaker,
  WithRetry,
  WithTimeout,
  ErrorRateBreakingStrategy,
} from 'node-resily';

@Injectable()
export class PaymentService {
  @WithCircuitBreaker({
    name: 'payment',
    breakingStrategy: new ErrorRateBreakingStrategy({
      failureRateThreshold: 50,
      minRequestCount: 10,
    }),
  })
  @WithRetry({ maxAttempts: 3 })
  @WithTimeout(5_000)
  async processPayment(amount: number) {
    return this.http.post('/payment', { amount });
  }
}
```

### ResilienceModule (NestJS DI)

Register breakers, retries, and bulkheads centrally and inject them anywhere in your NestJS app:

```ts
import { Injectable, Module } from '@nestjs/common';
import {
  ResilienceModule,
  InjectCircuitBreaker,
  ConsecutiveFailureBreakingStrategy,
  HttpFailureDetector,
} from 'node-resily';
import type { CircuitBreaker } from 'node-resily';

@Module({
  imports: [
    ResilienceModule.forRoot({
      circuitBreakers: [
        {
          name: 'paymentService',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
          failureDetectionStrategy: new HttpFailureDetector(),
          timeoutMs: 3_000,
        },
      ],
    }),
  ],
})
export class AppModule {}

@Injectable()
export class PaymentService {
  constructor(
    @InjectCircuitBreaker('paymentService')
    private readonly breaker: CircuitBreaker,
  ) {}

  async charge() {
    return this.breaker.execute(() => this.httpClient.post(...));
  }
}
```

## Health monitoring

```ts
import { ResilienceHealth } from 'node-resily';

const health = new ResilienceHealth();

health
  .register(paymentBreaker)
  .register(inventoryBreaker)
  .register(notificationBreaker);

const summary = health.getSummary();
console.log(summary.status); // 'healthy' | 'degraded' | 'critical'

app.get('/health', (req, res) => {
  res.json(health.getSummary());
});
```

`getSummary()` returns an overall status plus per-breaker snapshots (state, window stats, consecutive failures, etc.).

## Prometheus metrics

Pipe circuit breaker state and counters to Prometheus/Grafana via the optional adapter. Requires `prom-client` as a peer dependency.

```bash
npm install prom-client
```

```ts
import { Registry } from 'prom-client';
import { PrometheusAdapter } from 'node-resily/prometheus';

const registry = new Registry();
const adapter = new PrometheusAdapter({ registry });

adapter.observe(paymentBreaker);
adapter.observe(inventoryBreaker);

// Exposes these metrics:
// node_resily_circuit_state{name="paymentService"} 0|1|2
// node_resily_circuit_failures_total{name="paymentService"}
// node_resily_circuit_success_total{name="paymentService"}
// node_resily_circuit_error_rate{name="paymentService"}
```

## Events reference

| Event | When | Payload |
|-------|------|---------|
| `open` | Circuit opens | — |
| `close` | Circuit closes | — |
| `halfOpen` | Enters half-open | — |
| `success` | Successful call | `result`, `durationMs` |
| `failure` | Failed call | `error`, `durationMs` |
| `timeout` | Call timed out | `TimeoutError` |
| `fallback` | Fallback ran | fallback result |
| `reject` | Rejected while open | `CircuitOpenError` |

## API reference

`CircuitBreaker` constructor options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Breaker identifier |
| `breakingStrategy` | `IBreakingStrategy` | consecutive failures (5) | When to open |
| `resetStrategy` | `IResetStrategy` | time-based (30 000 ms) | When to try again (half-open probe) |
| `failureDetectionStrategy` | `IFailureDetector` | `DefaultFailureDetector` | What counts as failure |
| `timeoutMs` | `number` | undefined | Per-call timeout |
| `fallback` | — | — | Not on the constructor — pass to `execute(action, { fallback })` |
| `abortController` | `AbortController` | undefined | For cancellation; aborted when `timeoutMs` fires |
| `autoRenewAbortController` | `boolean` | `false` | Replace controller on closed / half-open transitions |
| `halfOpenRequests` | `number` | `1` | Concurrent probe calls allowed during half-open |
| `successThreshold` | `number` | `1` | Consecutive successes required to close from half-open |
| `windowMs` | `number` | `60_000` | Rolling window duration in ms (used by stats and error-rate breaking) |
| `bucketCount` | `number` | `10` | Number of buckets the rolling window is divided into |

## Limitations

- Retry does not ship a built-in exponential backoff class — the Retry section above shows how to implement one in ~10 lines using `IRetryStrategy`.
- The standalone **`Timeout`** class does not integrate `AbortController`; cancellation wiring lives on `CircuitBreaker`.
- **State is in-memory** per process. Separate deployments or horizontal replicas do not share breaker state unless you add external coordination.
- **Decorators** share one `CircuitBreaker` / `Retry` / `Timeout` **per decorated method** on the class (not per DI instance). Circuit state is shared; retry budgets and timeout races are per call — see **NestJS**.
- **Nest / `reflect-metadata`** are optional peers; the core library does not require a framework.

## Contributing

Issues and PRs are welcome on [github.com/astitva3110/node-resily](https://github.com/astitva3110/node-resily).

## License
 
MIT 
