import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/** gRPC statuses that imply the circuit should count a counted failure by default. */
const GRPC_FAILURE_CODES: ReadonlySet<number> = new Set([2, 4, 8, 13, 14]);

/** gRPC statuses that should explicitly not trip the breaker by default. */
const GRPC_SAFE_CODES: ReadonlySet<number> = new Set([0, 5, 7, 16]);

/**
 * Failure detector keyed on numerical `grpc` / `@grpc/grpc-js`-style `{ code }` fields.
 *
 * @remarks
 * Failure semantics follow common Node gRPC enums (e.g. `14` unavailable is failure).
 */
export class GrpcFailureDetector implements IFailureDetector {
  /** @inheritdoc */
  isFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const maybeCode = Reflect.get(error, 'code');

    const code =
      typeof maybeCode === 'number'
        ? maybeCode
        : typeof maybeCode === 'string'
          ? Number(maybeCode)
          : NaN;

    if (!Number.isFinite(code)) {
      return error instanceof Error;
    }

    if (GRPC_FAILURE_CODES.has(code)) {
      return true;
    }

    if (GRPC_SAFE_CODES.has(code)) {
      return false;
    }

    return true;
  }

  /** @inheritdoc */
  isSuccess(result: unknown): boolean {
    if (
      typeof result !== 'object' ||
      result === null ||
      !('code' in result)
    ) {
      return true;
    }

    const maybeCode = Reflect.get(result, 'code');
    const code =
      typeof maybeCode === 'number' ? maybeCode : Number(maybeCode);
    return Number.isFinite(code) ? code === 0 : true;
  }
}
