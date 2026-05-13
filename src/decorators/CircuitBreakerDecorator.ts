import { CircuitBreaker } from '../core/CircuitBreaker';
import type { CircuitBreakerOptions } from '../core/CircuitBreaker';

/**
 * Method decorator that wraps the target async method with a {@link CircuitBreaker}.
 * A single `CircuitBreaker` instance is shared across all calls to the decorated method
 * on the same class instance.
 *
 * **Requires** `experimentalDecorators: true` and `emitDecoratorMetadata: true` in tsconfig.
 *
 * @param options - Circuit breaker configuration (same as {@link CircuitBreakerOptions}).
 *
 * @example
 * ```ts
 * class PaymentsService {
 *   \@WithCircuitBreaker({ name: 'payments-api' })
 *   async charge(amount: number): Promise<Receipt> { ... }
 * }
 * ```
 */
export function WithCircuitBreaker(
  options: CircuitBreakerOptions,
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const cb = new CircuitBreaker(options);

    descriptor.value = function (...args: unknown[]): unknown {
      return cb.execute(() =>
        Promise.resolve(originalMethod.apply(this, args)),
      );
    };

    return descriptor;
  };
}
