import { CustomFailureDetector } from '../../../../src/strategies/failure/custom.detector';

describe('CustomFailureDetector', () => {
  it('defaults shouldSucceed to permissive when omitted', () => {
    const d = new CustomFailureDetector({
      shouldFail: () => false,
    });

    expect(d.isSuccess('payload')).toBe(true);
  });

  it('delegates to user-provided predicates', () => {
    const d = new CustomFailureDetector({
      shouldFail: () => true,
      shouldSucceed: (r: unknown) => r === 'ok',
      name: 'test',
    });

    expect(d.isFailure(new Error('x'))).toBe(true);
    expect(d.isSuccess('bad')).toBe(false);
    expect(d.isSuccess('ok')).toBe(true);
    expect(d.name).toBe('test');
  });
});
