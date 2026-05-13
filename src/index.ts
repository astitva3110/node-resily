/**
 * resily — TypeScript resilience library for Node.js microservices.
 *
 * Implements circuit breaker, retry, timeout, and bulkhead patterns
 * via a pluggable strategy pattern.
 *
 * @packageDocumentation
 */

// Core primitives
export * from './core';

// Pluggable strategies
export * from './strategies';

// Public interfaces (for implementing custom strategies)
export type {
  BreakingStrategyContext,
  BreakingWindowSnapshot,
  IBreakingStrategy,
  IFailureDetectionStrategy,
  IFailureDetector,
  IHealthStatus,
  IHealthSummary,
  IHealthWindowStats,
  IResetStrategy,
  IRetryStrategy,
  ResetStrategyContext,
} from './interfaces';

// Errors
export * from './errors';

// Health aggregation for multi-circuit observability
export { ResilienceHealth } from './health';
export type { ResilienceHealthOptions } from './health';

// Decorators (requires experimentalDecorators in tsconfig)
export * from './decorators';
