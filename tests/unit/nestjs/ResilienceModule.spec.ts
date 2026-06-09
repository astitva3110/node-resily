import 'reflect-metadata';

jest.mock('@nestjs/common', () => ({
  Module: jest.fn(() => (): ClassDecorator => () => {}),
  Inject: jest.fn((_token: string) => (): ParameterDecorator => (): void => {}),
}));

import * as nestCommon from '@nestjs/common';
import {
  ResilienceModule,
  InjectCircuitBreaker,
  InjectRetry,
  InjectBulkhead,
  getCircuitBreakerToken,
  getRetryToken,
  getBulkheadToken,
  RESILY_MODULE_OPTIONS,
} from '../../../src/adapters/ResilienceModule';
import { CircuitBreaker } from '../../../src/core/CircuitBreaker';
import { Retry } from '../../../src/core/Retry';
import { Bulkhead } from '../../../src/core/Bulkhead';
import { ConsecutiveFailureBreakingStrategy } from '../../../src/strategies/breaking/ConsecutiveFailureBreakingStrategy';

// ── Token helpers ──────────────────────────────────────────────────────────────

describe('token helpers', () => {
  it('getCircuitBreakerToken returns RESILY_CIRCUIT_BREAKER_<name>', () => {
    expect(getCircuitBreakerToken('payments')).toBe('RESILY_CIRCUIT_BREAKER_payments');
  });

  it('getRetryToken returns RESILY_RETRY_<name>', () => {
    expect(getRetryToken('payments')).toBe('RESILY_RETRY_payments');
  });

  it('getBulkheadToken returns RESILY_BULKHEAD_<name>', () => {
    expect(getBulkheadToken('search')).toBe('RESILY_BULKHEAD_search');
  });
});

// ── Inject decorators ──────────────────────────────────────────────────────────

describe('inject decorators', () => {
  beforeEach(() => {
    (nestCommon.Inject as jest.Mock).mockClear();
  });

  it('InjectCircuitBreaker calls Inject with the circuit breaker token', () => {
    const target = class {};
    InjectCircuitBreaker('payments')(target.prototype, 'breaker', 0);
    expect(nestCommon.Inject).toHaveBeenCalledWith('RESILY_CIRCUIT_BREAKER_payments');
  });

  it('InjectRetry calls Inject with the retry token', () => {
    const target = class {};
    InjectRetry('payments')(target.prototype, 'retry', 0);
    expect(nestCommon.Inject).toHaveBeenCalledWith('RESILY_RETRY_payments');
  });

  it('InjectBulkhead calls Inject with the bulkhead token', () => {
    const target = class {};
    InjectBulkhead('search')(target.prototype, 'bulkhead', 0);
    expect(nestCommon.Inject).toHaveBeenCalledWith('RESILY_BULKHEAD_search');
  });
});

// ── ResilienceModule.forRoot() ─────────────────────────────────────────────────

describe('ResilienceModule.forRoot()', () => {
  it('returns a dynamic module with the ResilienceModule class as module', () => {
    const mod = ResilienceModule.forRoot({});
    expect(mod.module).toBe(ResilienceModule);
  });

  it('is global', () => {
    const mod = ResilienceModule.forRoot({});
    expect(mod.global).toBe(true);
  });

  it('creates a circuit breaker provider with the correct token', () => {
    const mod = ResilienceModule.forRoot({
      circuitBreakers: [{ name: 'payments' }],
    });

    const provider = (mod.providers as Array<{ provide: string }>).find(
      (p) => p.provide === 'RESILY_CIRCUIT_BREAKER_payments',
    );
    expect(provider).toBeDefined();
  });

  it('the circuit breaker factory returns a CircuitBreaker instance', () => {
    const mod = ResilienceModule.forRoot({
      circuitBreakers: [
        {
          name: 'payments',
          breakingStrategy: new ConsecutiveFailureBreakingStrategy(3),
        },
      ],
    });

    const provider = (
      mod.providers as Array<{ provide: string; useFactory: () => unknown }>
    ).find((p) => p.provide === 'RESILY_CIRCUIT_BREAKER_payments')!;

    expect(provider.useFactory()).toBeInstanceOf(CircuitBreaker);
  });

  it('exports the circuit breaker token', () => {
    const mod = ResilienceModule.forRoot({ circuitBreakers: [{ name: 'svc' }] });
    expect(mod.exports).toContain('RESILY_CIRCUIT_BREAKER_svc');
  });

  it('creates a retry provider with the correct token', () => {
    const mod = ResilienceModule.forRoot({
      retries: [{ name: 'payments', maxAttempts: 3 }],
    });

    const provider = (mod.providers as Array<{ provide: string }>).find(
      (p) => p.provide === 'RESILY_RETRY_payments',
    );
    expect(provider).toBeDefined();
  });

  it('the retry factory returns a Retry instance', () => {
    const mod = ResilienceModule.forRoot({
      retries: [{ name: 'payments', maxAttempts: 3 }],
    });

    const provider = (
      mod.providers as Array<{ provide: string; useFactory: () => unknown }>
    ).find((p) => p.provide === 'RESILY_RETRY_payments')!;

    expect(provider.useFactory()).toBeInstanceOf(Retry);
  });

  it('creates a bulkhead provider with the correct token', () => {
    const mod = ResilienceModule.forRoot({
      bulkheads: [{ name: 'search', maxConcurrent: 10 }],
    });

    const provider = (mod.providers as Array<{ provide: string }>).find(
      (p) => p.provide === 'RESILY_BULKHEAD_search',
    );
    expect(provider).toBeDefined();
  });

  it('the bulkhead factory returns a Bulkhead instance', () => {
    const mod = ResilienceModule.forRoot({
      bulkheads: [{ name: 'search', maxConcurrent: 5 }],
    });

    const provider = (
      mod.providers as Array<{ provide: string; useFactory: () => unknown }>
    ).find((p) => p.provide === 'RESILY_BULKHEAD_search')!;

    expect(provider.useFactory()).toBeInstanceOf(Bulkhead);
  });

  it('registers multiple primitives in a single call', () => {
    const mod = ResilienceModule.forRoot({
      circuitBreakers: [{ name: 'cb1' }, { name: 'cb2' }],
      retries: [{ name: 'r1', maxAttempts: 2 }],
      bulkheads: [{ name: 'bh1', maxConcurrent: 4 }],
    });

    expect(mod.providers).toHaveLength(4);
    expect(mod.exports).toHaveLength(4);
  });

  it('empty options returns a module with no providers', () => {
    const mod = ResilienceModule.forRoot({});
    expect(mod.providers).toHaveLength(0);
    expect(mod.exports).toHaveLength(0);
  });
});

// ── ResilienceModule.forRootAsync() ───────────────────────────────────────────

describe('ResilienceModule.forRootAsync()', () => {
  it('returns a dynamic module with the ResilienceModule class as module', () => {
    const mod = ResilienceModule.forRootAsync({ useFactory: () => ({}) });
    expect(mod.module).toBe(ResilienceModule);
  });

  it('is global', () => {
    const mod = ResilienceModule.forRootAsync({ useFactory: () => ({}) });
    expect(mod.global).toBe(true);
  });

  it('includes an options provider with the RESILY_MODULE_OPTIONS token', () => {
    const factory = jest.fn(() => ({ circuitBreakers: [{ name: 'payments' }] }));
    const mod = ResilienceModule.forRootAsync({ useFactory: factory });

    const provider = (
      mod.providers as Array<{ provide: string; useFactory: unknown }>
    ).find((p) => p.provide === RESILY_MODULE_OPTIONS);

    expect(provider).toBeDefined();
    expect(provider!.useFactory).toBe(factory);
  });

  it('passes inject tokens through to the options provider', () => {
    const TOKEN = 'CONFIG_SERVICE';
    const mod = ResilienceModule.forRootAsync({
      useFactory: () => ({}),
      inject: [TOKEN],
    });

    const provider = (
      mod.providers as Array<{ provide: string; inject?: unknown[] }>
    ).find((p) => p.provide === RESILY_MODULE_OPTIONS);

    expect(provider!.inject).toContain(TOKEN);
  });

  it('exports the RESILY_MODULE_OPTIONS token', () => {
    const mod = ResilienceModule.forRootAsync({ useFactory: () => ({}) });
    expect(mod.exports).toContain(RESILY_MODULE_OPTIONS);
  });

  it('includes provided imports in the dynamic module', () => {
    const FakeModule = class {};
    const mod = ResilienceModule.forRootAsync({
      useFactory: () => ({}),
      imports: [FakeModule],
    });

    expect(mod.imports).toContain(FakeModule);
  });

  it('async useFactory can return a Promise', async () => {
    const factory = async () =>
      Promise.resolve({ circuitBreakers: [{ name: 'async-svc' }] });

    const mod = ResilienceModule.forRootAsync({ useFactory: factory });

    const provider = (
      mod.providers as Array<{ provide: string; useFactory: () => Promise<unknown> }>
    ).find((p) => p.provide === RESILY_MODULE_OPTIONS)!;

    const result = await provider.useFactory();
    expect(result).toEqual({ circuitBreakers: [{ name: 'async-svc' }] });
  });
});

// ── @Module applied on class ───────────────────────────────────────────────────

describe('ResilienceModule class', () => {
  it('@Module is applied to the class when NestJS is available', () => {
    expect(nestCommon.Module).toHaveBeenCalled();
  });
});
