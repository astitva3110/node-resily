import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

const GRPC_FAILURE_CODES: ReadonlySet<number> = new Set([2, 4, 8, 13, 14]);
const GRPC_SAFE_CODES: ReadonlySet<number> = new Set([0, 5, 7, 16]);

/** Uses gRPC-style numeric `code` on errors and results (e.g. `@grpc/grpc-js`). */
export class GrpcFailureDetector implements IFailureDetector {
  /** Maps well-known gRPC codes; non-finite codes fall back to treating errors as failures. */
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

  /** `code === 0` when present; otherwise permissive. */
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
