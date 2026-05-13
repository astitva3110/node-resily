import { GrpcFailureDetector } from '../../../../src/strategies/failure/grpc.detector';

describe('GrpcFailureDetector', () => {
  it('parses grpc code provided as numeric string', () => {
    const d = new GrpcFailureDetector();
    const err = Object.assign(new Error('unavailable'), { code: '14' });
    expect(d.isFailure(err)).toBe(true);
  });

  it('counts code 14 (UNAVAILABLE) as failure', () => {
    const d = new GrpcFailureDetector();
    const err = Object.assign(new Error('unavailable'), { code: 14 });
    expect(d.isFailure(err)).toBe(true);
  });

  it('counts code 5 (NOT_FOUND) as not failure', () => {
    const d = new GrpcFailureDetector();
    const err = Object.assign(new Error('nf'), { code: 5 });
    expect(d.isFailure(err)).toBe(false);
  });

  it('counts code 0 (OK) as not failure', () => {
    const d = new GrpcFailureDetector();
    expect(d.isSuccess({ code: 0, message: '' })).toBe(true);
    const err = Object.assign(new Error('ok'), { code: 0 });
    expect(d.isFailure(err)).toBe(false);
  });

  it('treats non-object grpc results without code as successes', () => {
    expect(new GrpcFailureDetector().isSuccess(null)).toBe(true);
  });

  it('treats malformed grpc numeric codes leniently for success payloads', () => {
    expect(new GrpcFailureDetector().isSuccess({ code: 'nope', message: '' })).toBe(true);
  });

  it('does not classify non-errors as grpc failures', () => {
    expect(new GrpcFailureDetector().isFailure('oops')).toBe(false);
  });
});
