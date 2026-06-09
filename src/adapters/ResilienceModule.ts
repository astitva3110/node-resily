import type { DynamicModule } from '@nestjs/common';
import { CircuitBreaker } from '../core/CircuitBreaker';
import type { CircuitBreakerOptions } from '../core/CircuitBreaker';
import { Retry } from '../core/Retry';
import type { RetryOptions } from '../core/Retry';
import { Bulkhead } from '../core/Bulkhead';
import type { BulkheadOptions } from '../core/Bulkhead';

/** Options for a named circuit breaker registered in {@link ResilienceModule}. */
export type CircuitBreakerModuleConfig = CircuitBreakerOptions;

/** Options for a named retry registered in {@link ResilienceModule}. */
export interface RetryModuleConfig extends RetryOptions {
  name: string;
}

/** Options for a named bulkhead registered in {@link ResilienceModule}. */
export interface BulkheadModuleConfig extends BulkheadOptions {
  name: string;
}

/** Synchronous configuration passed to {@link ResilienceModule.forRoot}. */
export interface ResilienceModuleOptions {
  circuitBreakers?: CircuitBreakerModuleConfig[];
  retries?: RetryModuleConfig[];
  bulkheads?: BulkheadModuleConfig[];
}

/** Async configuration passed to {@link ResilienceModule.forRootAsync}. */
export interface ResilienceModuleAsyncOptions {
  useFactory: (...args: unknown[]) => ResilienceModuleOptions | Promise<ResilienceModuleOptions>;
  inject?: unknown[];
  imports?: unknown[];
}

/** Injection token for the raw async options object (used internally). */
export const RESILY_MODULE_OPTIONS = 'RESILY_MODULE_OPTIONS' as const;

/** Injection token for a named {@link CircuitBreaker}. */
export function getCircuitBreakerToken(name: string): string {
  return `RESILY_CIRCUIT_BREAKER_${name}`;
}

/** Injection token for a named {@link Retry}. */
export function getRetryToken(name: string): string {
  return `RESILY_RETRY_${name}`;
}

/** Injection token for a named {@link Bulkhead}. */
export function getBulkheadToken(name: string): string {
  return `RESILY_BULKHEAD_${name}`;
}

/**
 * Parameter decorator that injects a named {@link CircuitBreaker} registered via {@link ResilienceModule}.
 * @example
 * constructor(@InjectCircuitBreaker('payments') private readonly cb: CircuitBreaker) {}
 */
export function InjectCircuitBreaker(name: string): ParameterDecorator {
  return buildInjectDecorator(getCircuitBreakerToken(name));
}

/**
 * Parameter decorator that injects a named {@link Retry} registered via {@link ResilienceModule}.
 * @example
 * constructor(@InjectRetry('payments') private readonly retry: Retry) {}
 */
export function InjectRetry(name: string): ParameterDecorator {
  return buildInjectDecorator(getRetryToken(name));
}

/**
 * Parameter decorator that injects a named {@link Bulkhead} registered via {@link ResilienceModule}.
 * @example
 * constructor(@InjectBulkhead('search') private readonly bulkhead: Bulkhead) {}
 */
export function InjectBulkhead(name: string): ParameterDecorator {
  return buildInjectDecorator(getBulkheadToken(name));
}

function buildInjectDecorator(token: string): ParameterDecorator {
  return (target: object, key: string | symbol | undefined, index: number): void => {
    let Inject: (t: string) => ParameterDecorator;
    try {
      ({ Inject } = require('@nestjs/common') as { Inject: (t: string) => ParameterDecorator });
    } catch {
      return;
    }
    Inject(token)(target, key, index);
  };
}

interface FactoryProvider {
  provide: string;
  useFactory: (...args: unknown[]) => unknown;
  inject?: unknown[];
}

function buildProviders(options: ResilienceModuleOptions): FactoryProvider[] {
  const providers: FactoryProvider[] = [];

  for (const config of options.circuitBreakers ?? []) {
    const captured = config;
    providers.push({
      provide: getCircuitBreakerToken(captured.name),
      useFactory: () => new CircuitBreaker(captured),
    });
  }

  for (const config of options.retries ?? []) {
    const captured = config;
    providers.push({
      provide: getRetryToken(captured.name),
      useFactory: () => new Retry(captured),
    });
  }

  for (const config of options.bulkheads ?? []) {
    const captured = config;
    providers.push({
      provide: getBulkheadToken(captured.name),
      useFactory: () => new Bulkhead(captured),
    });
  }

  return providers;
}

/**
 * NestJS dynamic module that registers circuit breakers, retries, and bulkheads as providers.
 *
 * @example
 * // app.module.ts
 * @Module({
 *   imports: [
 *     ResilienceModule.forRoot({
 *       circuitBreakers: [{ name: 'payments', timeoutMs: 3000 }],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 */
export class ResilienceModule {
  /** Synchronous registration — returns a global dynamic module. */
  static forRoot(options: ResilienceModuleOptions): DynamicModule {
    const providers = buildProviders(options);
    const exports = providers.map((p) => p.provide);

    return {
      module: ResilienceModule,
      global: true,
      providers: providers as unknown[],
      exports,
    } as DynamicModule;
  }

  /**
   * Async registration — resolves options via an async factory before creating providers.
   *
   * Named injection with `@InjectCircuitBreaker` is not available for async-configured
   * primitives without a secondary `forRoot` call. Use the `RESILY_MODULE_OPTIONS` token to
   * access the resolved options if you need dynamic lookup at runtime.
   */
  static forRootAsync(asyncOptions: ResilienceModuleAsyncOptions): DynamicModule {
    const optionsProvider: FactoryProvider = {
      provide: RESILY_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject ?? [],
    };

    return {
      module: ResilienceModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [optionsProvider] as unknown[],
      exports: [RESILY_MODULE_OPTIONS],
    } as unknown as DynamicModule;
  }
}

// Apply NestJS @Module decorator when the peer is installed.
try {
  const { Module } = require('@nestjs/common') as {
    Module: (meta: object) => ClassDecorator;
  };
  Module({ providers: [], exports: [] })(ResilienceModule);
} catch {
  /* NestJS not installed — ResilienceModule still provides forRoot/forRootAsync */
}
