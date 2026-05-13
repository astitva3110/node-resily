import { Retry } from '../../../src/core/Retry';
import { MaxRetriesExceededError } from '../../../src/errors/MaxRetriesExceededError';

describe('Retry', () => {
  it('returns the result on the first successful attempt', async () => {
    const retry = new Retry({ maxAttempts: 3 });
    const result = await retry.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('succeeds after transient failures', async () => {
    let calls = 0;
    const retry = new Retry({ maxAttempts: 3 });

    const result = await retry.execute(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    });

    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('throws MaxRetriesExceededError when all attempts are exhausted', async () => {
    const retry = new Retry({ maxAttempts: 2 });
    await expect(
      retry.execute(() => Promise.reject(new Error('permanent'))),
    ).rejects.toBeInstanceOf(MaxRetriesExceededError);
  });

  it('throws RangeError for maxAttempts < 1', () => {
    expect(() => new Retry({ maxAttempts: 0 })).toThrow(RangeError);
  });
});
