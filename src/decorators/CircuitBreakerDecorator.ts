import { CircuitBreaker } from '../core/CircuitBreaker';
import type { CircuitBreakerOptions } from '../core/CircuitBreaker';

/**
 * Wraps the method with {@link CircuitBreaker.prototype.execute}. One breaker per method, shared by all instances of the class.
 * Requires `experimentalDecorators` and `emitDecoratorMetadata`.
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
