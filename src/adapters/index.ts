export { ResilyModule } from './NestJsModule';

export {
  ResilienceModule,
  InjectCircuitBreaker,
  InjectRetry,
  InjectBulkhead,
  getCircuitBreakerToken,
  getRetryToken,
  getBulkheadToken,
  RESILY_MODULE_OPTIONS,
} from './ResilienceModule';

export type {
  CircuitBreakerModuleConfig,
  RetryModuleConfig,
  BulkheadModuleConfig,
  ResilienceModuleOptions,
  ResilienceModuleAsyncOptions,
} from './ResilienceModule';
