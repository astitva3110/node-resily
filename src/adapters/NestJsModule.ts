/**
 * Nest optional adapter: `ResilyModule` is `@Module({})` when `@nestjs/common` is installed.
 * Requires peer `@nestjs/common` at runtime.
 */
let Module: (meta: object) => ClassDecorator;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ Module } = require('@nestjs/common') as {
    Module: (meta: object) => ClassDecorator;
  });
} catch {
  /* Nest not installed */
}

function createResilyModule(): new () => object {
  class ResilyModule {}

  if (Module) {
    Module({ imports: [], exports: [] })(ResilyModule);
  }

  return ResilyModule;
}

export const ResilyModule = createResilyModule();
