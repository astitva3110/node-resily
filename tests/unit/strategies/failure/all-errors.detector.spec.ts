import { AllErrorsFailureDetectionStrategy } from '../../../../src/strategies/failure/AllErrorsFailureDetectionStrategy';
import { DefaultFailureDetector } from '../../../../src/strategies/failure/default.detector';

describe('AllErrorsFailureDetectionStrategy', () => {
  let detector: AllErrorsFailureDetectionStrategy;

  beforeEach(() => {
    detector = new AllErrorsFailureDetectionStrategy();
  });

  it('treats an Error instance as failure', () => {
    expect(detector.isFailure(new Error('x'))).toBe(true);
  });

  it('treats a thrown string value as failure', () => {
    expect(detector.isFailure('boom')).toBe(true);
  });

  it('treats a plain object as failure', () => {
    expect(detector.isFailure({ reason: 'nope' })).toBe(true);
  });

  it('treats null as failure', () => {
    expect(detector.isFailure(null)).toBe(true);
  });

  it('treats undefined as failure', () => {
    expect(detector.isFailure(undefined)).toBe(true);
  });

  it('treats any resolved result as success', () => {
    expect(detector.isSuccess(0)).toBe(true);
    expect(detector.isSuccess('ok')).toBe(true);
    expect(detector.isSuccess({ data: true })).toBe(true);
    expect(detector.isSuccess(null)).toBe(true);
  });

  it('classifies string as failure unlike DefaultFailureDetector', () => {
    const def = new DefaultFailureDetector();

    expect(def.isFailure('string')).toBe(false);
    expect(detector.isFailure('string')).toBe(true);
  });
});
