/**
 * node-resily — circuit breaker, retry, timeout, bulkhead with pluggable strategies.
 * @packageDocumentation
 */

export * from './core';
export * from './strategies';

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

export * from './errors';

export { ResilienceHealth } from './health';
export type { ResilienceHealthOptions } from './health';

export * from './decorators';

export {
  ResilienceModule,
  InjectCircuitBreaker,
  InjectRetry,
  InjectBulkhead,
  getCircuitBreakerToken,
  getRetryToken,
  getBulkheadToken,
  RESILY_MODULE_OPTIONS,
} from './adapters';

export type {
  CircuitBreakerModuleConfig,
  RetryModuleConfig,
  BulkheadModuleConfig,
  ResilienceModuleOptions,
  ResilienceModuleAsyncOptions,
} from './adapters';
