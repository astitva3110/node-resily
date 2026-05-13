import { Retry } from '../core/Retry';
import type { RetryOptions } from '../core/Retry';

/** Retries the method with {@link Retry}; one executor per method, shared by all instances of the class. */
export function WithRetry(options: RetryOptions): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const retry = new Retry(options);

    descriptor.value = function (...args: unknown[]): unknown {
      return retry.execute(() =>
        Promise.resolve(originalMethod.apply(this, args)),
      );
    };

    return descriptor;
  };
}
