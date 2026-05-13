import { Retry } from '../core/Retry';
import type { RetryOptions } from '../core/Retry';

/**
 * Method decorator that automatically retries the decorated async method
 * on failure according to the provided {@link RetryOptions}.
 *
 * @param options - Retry configuration.
 *
 * @example
 * ```ts
 * class InventoryService {
 *   \@WithRetry({ maxAttempts: 3 })
 *   async fetchStock(sku: string): Promise<number> { ... }
 * }
 * ```
 */
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
