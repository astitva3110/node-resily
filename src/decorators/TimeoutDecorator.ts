import { Timeout } from '../core/Timeout';

/**
 * Method decorator that enforces a maximum execution time on the decorated async method.
 * Throws {@link TimeoutError} if the method takes longer than `timeoutMs`.
 *
 * @param timeoutMs - Maximum allowed duration in milliseconds.
 *
 * @example
 * ```ts
 * class ReportService {
 *   \@WithTimeout(5_000)
 *   async generateReport(): Promise<Report> { ... }
 * }
 * ```
 */
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
