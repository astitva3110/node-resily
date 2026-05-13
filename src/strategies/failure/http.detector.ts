import { TimeoutError } from '../../errors/TimeoutError';
import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * Configuration for {@link HttpFailureDetector}.
 */
export interface HttpFailureDetectorConfig {
  /** Explicit HTTP statuses that count as counted failures when present on thrown errors / results. */
  failOnStatusCodes?: readonly number[];

  /** Status codes that never count as failures even if they normally would. */
  ignoreStatusCodes?: readonly number[];

  /**
   * Error classes that never count as failures when `instanceof` matches.
   * Example: ignore validation errors emitted as HTTP-ish errors by some clients.
   */
  ignoreErrors?: ReadonlyArray<new (...args: never[]) => Error>;

  /**
   * Whether {@link TimeoutError} instances should count as failures.
   * @defaultValue true
   */
  failOnTimeout?: boolean;
}

const DEFAULT_FAIL_ON_STATUS: readonly number[] = [500, 502, 503, 504];

/** HTTP-oriented failure classifier for circuits wrapping fetch/axios-style APIs. */
export class HttpFailureDetector implements IFailureDetector {
  private readonly failOnStatusCodes: readonly number[];

  private readonly ignoreStatusCodesSet: ReadonlySet<number>;

  private readonly ignoreErrorCtors: ReadonlyArray<new (...args: never[]) => Error>;

  private readonly failOnTimeout: boolean;

  /**
   * @param config - Optional HTTP status allow/deny overrides.
   */
  constructor(config: HttpFailureDetectorConfig = {}) {
    this.failOnStatusCodes = [...(config.failOnStatusCodes ?? DEFAULT_FAIL_ON_STATUS)];
    const ignore = config.ignoreStatusCodes ?? [];
    this.ignoreStatusCodesSet = new Set(ignore.map((code) => code));
    this.ignoreErrorCtors = [...(config.ignoreErrors ?? [])];
    this.failOnTimeout = config.failOnTimeout ?? true;
  }

  /** @inheritdoc */
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

  /** @inheritdoc */
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
