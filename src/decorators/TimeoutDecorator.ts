import { Timeout } from '../core/Timeout';

/** Enforces `timeoutMs` on the method via {@link Timeout}; one timer per method, shared by all instances of the class. */
export function WithTimeout(timeoutMs: number): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const timeout = new Timeout(timeoutMs);

    descriptor.value = function (...args: unknown[]): unknown {
      return timeout.execute(() =>
        Promise.resolve(originalMethod.apply(this, args)),
      );
    };

    return descriptor;
  };
}
