import { TimeoutError } from '../../../../src/errors/TimeoutError';
import { HttpFailureDetector } from '../../../../src/strategies/failure/http.detector';

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

describe('HttpFailureDetector', () => {
  it('honours explicit failOnStatusCodes overrides', () => {
    const d = new HttpFailureDetector({ failOnStatusCodes: [418] });
    const err = Object.assign(new Error('teapot'), { status: 418 });
    expect(d.isFailure(err)).toBe(true);
  });

  it('treats sub-500 statuses as non-failures by default', () => {
    const d = new HttpFailureDetector();
    const err = Object.assign(new Error('client'), { statusCode: 422 });
    expect(d.isFailure(err)).toBe(false);
  });

  it('treats status >= 500 as failures when not ignored', () => {
    const d = new HttpFailureDetector();
    const err = Object.assign(new Error('bad'), { status: 599 });
    expect(d.isFailure(err)).toBe(true);
  });

  it('counts status 500 responses as failures via error shape', () => {
    const d = new HttpFailureDetector();
    const err = Object.assign(new Error('server'), { statusCode: 500 });
    expect(d.isFailure(err)).toBe(true);
  });

  it('ignores matched ignoreStatusCodes', () => {
    const d = new HttpFailureDetector({ ignoreStatusCodes: [404] });
    const err = Object.assign(new Error('nf'), { status: 404 });
    expect(d.isFailure(err)).toBe(false);
  });

  it('ignores errors that match ignoreErrors', () => {
    const d = new HttpFailureDetector({ ignoreErrors: [ValidationError] });
    expect(d.isFailure(new ValidationError('bad input'))).toBe(false);
  });

  it('can ignore TimeoutError when failOnTimeout is false', () => {
    const d = new HttpFailureDetector({ failOnTimeout: false });
    expect(d.isFailure(new TimeoutError(123))).toBe(false);
  });

  it('treats HTTP 200 results as success via isSuccess', () => {
    const d = new HttpFailureDetector();
    expect(d.isSuccess({ status: 200, body: '{}' })).toBe(true);
  });

  it('treats plain payloads without status metadata as successes', () => {
    expect(new HttpFailureDetector().isSuccess({ data: 1 })).toBe(true);
  });

  it('rejects non-finite status fields for error classification', () => {
    const d = new HttpFailureDetector();
    const err = Object.assign(new Error('weird'), { status: Number.NaN });
    expect(d.isFailure(err)).toBe(true);
  });

  describe('status vs statusCode precedence', () => {
    it('prefers `status` over `statusCode` via readHttpStatus (nullish-coalesce)', () => {
      const d = new HttpFailureDetector();

      const errPrefer200 = Object.assign(new Error('mismatch'), {
        status: 200,
        statusCode: 500,
      });
      expect(d.isFailure(errPrefer200)).toBe(false);

      const errPrefer500 = Object.assign(new Error('mismatch'), {
        status: 500,
        statusCode: 200,
      });
      expect(d.isFailure(errPrefer500)).toBe(true);

      expect(d.isSuccess({ status: 200, statusCode: 500 })).toBe(true);
      expect(d.isSuccess({ status: 500, statusCode: 200 })).toBe(false);
    });
  });
});
