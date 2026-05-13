import { TimeoutError } from '../../errors/TimeoutError';
import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/** HTTP status on errors or `{ status, statusCode }` results; configurable lists and `TimeoutError` handling. */
export interface HttpFailureDetectorConfig {
  failOnStatusCodes?: readonly number[];
  ignoreStatusCodes?: readonly number[];
  ignoreErrors?: ReadonlyArray<new (...args: never[]) => Error>;
  failOnTimeout?: boolean;
}

const DEFAULT_FAIL_ON_STATUS: readonly number[] = [500, 502, 503, 504];

export class HttpFailureDetector implements IFailureDetector {
  private readonly failOnStatusCodes: readonly number[];

  private readonly ignoreStatusCodesSet: ReadonlySet<number>;

  private readonly ignoreErrorCtors: ReadonlyArray<new (...args: never[]) => Error>;

  private readonly failOnTimeout: boolean;

  /** Applies optional status lists, ignored error types, and `TimeoutError` policy. */
  constructor(config: HttpFailureDetectorConfig = {}) {
    this.failOnStatusCodes = [...(config.failOnStatusCodes ?? DEFAULT_FAIL_ON_STATUS)];
    const ignore = config.ignoreStatusCodes ?? [];
    this.ignoreStatusCodesSet = new Set(ignore.map((code) => code));
    this.ignoreErrorCtors = [...(config.ignoreErrors ?? [])];
    this.failOnTimeout = config.failOnTimeout ?? true;
  }

  /** Uses status on the error, 5xx defaults, and `ignoreErrors` / `ignoreStatusCodes`. */
  isFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    for (const ctor of this.ignoreErrorCtors) {
      if (error instanceof ctor) {
        return false;
      }
    }

    const status = readHttpStatus(error);
    if (status !== undefined) {
      if (this.ignoreStatusCodesSet.has(status)) {
        return false;
      }

      if (this.failOnStatusCodes.includes(status)) {
        return true;
      }

      return status >= 500;
    }

    if (error instanceof TimeoutError) {
      return this.failOnTimeout;
    }

    return true;
  }

  /** 2xx from `status` / `statusCode` on the result; permissive when absent. */
  isSuccess(result: unknown): boolean {
    const status = readHttpStatus(result);
    if (status !== undefined) {
      return status >= 200 && status < 300;
    }
    return true;
  }
}

function readHttpStatus(value: unknown): number | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !(('status' in value) || ('statusCode' in value))
  ) {
    return undefined;
  }

  const candidate =
    Reflect.get(value, 'status') ?? Reflect.get(value, 'statusCode');
  const n = typeof candidate === 'number' ? candidate : Number(candidate);

  return Number.isFinite(n) ? n : undefined;
}
