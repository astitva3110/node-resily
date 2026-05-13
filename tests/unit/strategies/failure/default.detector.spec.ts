import { DefaultFailureDetector } from '../../../../src/strategies/failure/default.detector';

describe('DefaultFailureDetector', () => {
  it('treats Errors as failures', () => {
    const d = new DefaultFailureDetector();
    expect(d.isFailure(new Error('x'))).toBe(true);
    expect(d.isSuccess('anything')).toBe(true);
  });

  it('does not classify non-Errors as failures when passed directly', () => {
    const d = new DefaultFailureDetector();
    expect(d.isFailure('not an error')).toBe(false);
  });
});
