# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-05-13

### Added

- CircuitBreaker with EventEmitter lifecycle events (`open`, `close`, `halfOpen`, `success`, `failure`, `timeout`, `fallback`, `reject`)
- Rolling window stats (60s window, 10 buckets)
- `AbortController` + `autoRenewAbortController` on CircuitBreaker
- Fallback via `execute()` options
- `shutdown()` and `initializeState()` for serverless / external state
- Three breaking strategies: `ConsecutiveFailureBreakingStrategy`, `ErrorRateBreakingStrategy`, `SlowCallBreakingStrategy`
- Two reset strategies: `TimeBasedResetStrategy`, `ExponentialResetStrategy`
- Six failure detectors: `DefaultFailureDetector`, `AllErrorsFailureDetectionStrategy`, `HttpFailureDetector`, `GrpcFailureDetector`, `CustomFailureDetector`, `CompositeFailureDetector`
- Retry with pluggable `IRetryStrategy`
- Timeout helper (promise race against a timer)
- Bulkhead with optional queue
- NestJS decorators: `@WithCircuitBreaker`, `@WithRetry`, `@WithTimeout`
- `ResilienceHealth` registry with `getSummary()` returning `healthy` / `degraded` / `critical`
- Full TypeScript, zero runtime dependencies in core
