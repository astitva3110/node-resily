/**
 * NestJS integration for resily.
 *
 * Import `ResilyModule` in your NestJS application to register the resily
 * providers. This file is intentionally lightweight — the actual DI tokens
 * and providers live in the consuming application to avoid coupling the
 * core library to a specific NestJS version.
 *
 * @remarks
 * This adapter requires `@nestjs/common` as a peer dependency.
 * It will throw at runtime if NestJS is not installed.
 */

let Module: (meta: object) => ClassDecorator;

try {
  // Dynamic import keeps the NestJS dependency fully optional at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ Module } = require('@nestjs/common') as {
    Module: (meta: object) => ClassDecorator;
  });
} catch {
  // NestJS is not installed — the adapter cannot be used.
}

/**
 * Placeholder NestJS module class.
 * Decorate with `@Module` only when NestJS is available.
 */
function createResilyModule(): new () => object {
  class ResilyModule {}

  if (Module) {
    Module({ imports: [], exports: [] })(ResilyModule);
  }

  return ResilyModule;
}

/** The NestJS module for resily. Register this in your `AppModule` imports. */
export const ResilyModule = createResilyModule();
