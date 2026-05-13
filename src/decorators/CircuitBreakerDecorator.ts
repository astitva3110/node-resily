import { CircuitBreaker } from '../core/CircuitBreaker';
import type {
  CircuitBreakerOptions,
  ExecuteOptions,
} from '../core/CircuitBreaker';

/** Constructor options for {@link WithCircuitBreaker} plus optional execute fallback. */
export type WithCircuitBreakerOptions = CircuitBreakerOptions & {
  fallback?: () => Promise<unknown>;
};

/**
 * Wraps the method with {@link CircuitBreaker.prototype.execute}. One breaker per method, shared by all instances of the class.
 * Requires `experimentalDecorators` and `emitDecoratorMetadata`.
 */
export function WithCircuitBreaker(
  options: WithCircuitBreakerOptions,
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const { fallback, ...circuitOptions } = options;
    const cb = new CircuitBreaker(circuitOptions);

    descriptor.value = function (...args: unknown[]): unknown {
      const executeOptions: ExecuteOptions<unknown> | undefined =
        fallback !== undefined ? { fallback } : undefined;
      return cb.execute(
        () => Promise.resolve(originalMethod.apply(this, args)),
        executeOptions,
      );
    };

    return descriptor;
  };
}
