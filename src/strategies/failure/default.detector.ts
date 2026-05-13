import type { IFailureDetector } from '../../interfaces/IFailureDetectionStrategy';

/**
 * Detector that treats any `Error` instance as failure and considers every resolved
 * value successful unless specialized detectors override `isSuccess`.
 */
export class DefaultFailureDetector implements IFailureDetector {
  /** @inheritdoc */
  isFailure(error: unknown): boolean {
    return error instanceof Error;
  }

  /** @inheritdoc */
  isSuccess(_result: unknown): boolean {
    return true;
  }
}
