import { CompositeFailureDetector } from '../../../../src/strategies/failure/composite.detector';
import type { IFailureDetector } from '../../../../src/interfaces/IFailureDetectionStrategy';

describe('CompositeFailureDetector', () => {
  function alwaysFailure(): IFailureDetector {
    return {
      isFailure: () => true,
      isSuccess: () => false,
    };
  }

  function neverFailure(): IFailureDetector {
    return {
      isFailure: () => false,
      isSuccess: () => true,
    };
  }

  it('throws when detectors list empty', () => {
    expect(
      () =>
        new CompositeFailureDetector({
          mode: 'ANY',
          detectors: [],
        }),
    ).toThrow(RangeError);
  });

  it('ANY mode: one detector reporting failure makes overall failure', () => {
    const d = new CompositeFailureDetector({
      mode: 'ANY',
      detectors: [neverFailure(), alwaysFailure()],
    });

    expect(d.isFailure(new Error('x'))).toBe(true);
  });

  it('ALL mode: one detector saying not failure makes overall not failure', () => {
    const d = new CompositeFailureDetector({
      mode: 'ALL',
      detectors: [
        {
          isFailure: (e: unknown) => e instanceof Error && e.message === 'a',
          isSuccess: () => true,
        },
        {
          isFailure: () => true,
          isSuccess: () => true,
        },
      ],
    });

    expect(d.isFailure(new Error('b'))).toBe(false);
  });

  it('ALL mode: all detectors agree on failure', () => {
    const d = new CompositeFailureDetector({
      mode: 'ALL',
      detectors: [alwaysFailure(), alwaysFailure()],
    });

    expect(d.isFailure(new Error('x'))).toBe(true);
  });

  it('ANY mode for isSuccess: one positive detection succeeds', () => {
    const d = new CompositeFailureDetector({
      mode: 'ANY',
      detectors: [
        { isFailure: () => false, isSuccess: () => false },
        { isFailure: () => false, isSuccess: () => true },
      ],
    });

    expect(d.isSuccess({})).toBe(true);
  });

  it('ALL mode for isSuccess: requires every detector to agree', () => {
    const d = new CompositeFailureDetector({
      mode: 'ALL',
      detectors: [
        { isFailure: () => false, isSuccess: () => true },
        { isFailure: () => false, isSuccess: () => false },
      ],
    });

    expect(d.isSuccess({})).toBe(false);
  });
});
