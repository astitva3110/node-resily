import { Retry } from '../../../src/core/Retry';
import type { IRetryStrategy } from '../../../src/interfaces/IRetryStrategy';
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
    const retry = new Retry({ maxAttempts: 3 });
    await expect(
      retry.execute(() => Promise.reject(new Error('permanent'))),
    ).rejects.toBeInstanceOf(MaxRetriesExceededError);
  });

  it('propagates the last error directly when shouldRetry returns false mid-run', async () => {
    const strategy: IRetryStrategy = {
      getDelay: () => 0,
      shouldRetry: jest.fn((_error: Error, attempt: number) => attempt < 2),
    };

    const retry = new Retry({ maxAttempts: 5, strategy });
    const err: unknown = await retry
      .execute(() => Promise.reject(new Error('stop')))
      .then(
        () => {
          throw new Error('expected rejection');
        },
        (e) => e,
      );

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(MaxRetriesExceededError);
    expect((err as Error).message).toBe('stop');
    expect(strategy.shouldRetry).toHaveBeenCalled();
  });

  it('awaits getDelay(ms) between attempts when using fake timers', async () => {
    jest.useFakeTimers();

    const strategy: IRetryStrategy = {
      getDelay: (attempt: number) => attempt * 100,
      shouldRetry: () => true,
    };

    try {
      let calls = 0;
      const retry = new Retry({ maxAttempts: 3, strategy });

      const promise = retry.execute(() => {
        calls += 1;
        if (calls < 3) return Promise.reject(new Error('retry'));
        return Promise.resolve('ok');
      });

      expect(calls).toBe(1);

      await jest.advanceTimersByTimeAsync(99);
      expect(calls).toBe(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);

      await jest.advanceTimersByTimeAsync(199);
      expect(calls).toBe(2);

      await jest.advanceTimersByTimeAsync(1);
      expect(calls).toBe(3);

      await expect(promise).resolves.toBe('ok');
    } finally {
      jest.useRealTimers();
    }
  });

  it('sleeps exactly the milliseconds returned by getDelay() before retrying', async () => {
    jest.useFakeTimers();

    const FIXED_DELAY_MS = 300;

    const getDelay = jest.fn((_attempt: number) => FIXED_DELAY_MS);
    const strategy: IRetryStrategy = {
      getDelay,
      shouldRetry: () => true,
    };

    try {
      let calls = 0;
      const retry = new Retry({ maxAttempts: 4, strategy });
      const promise = retry.execute(() => {
        calls += 1;
        if (calls < 4) return Promise.reject(new Error('retry'));
        return Promise.resolve('ok');
      });

      expect(calls).toBe(1);
      await jest.advanceTimersByTimeAsync(FIXED_DELAY_MS - 1);
      expect(calls).toBe(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);

      await jest.advanceTimersByTimeAsync(FIXED_DELAY_MS - 1);
      expect(calls).toBe(2);

      await jest.advanceTimersByTimeAsync(1);
      expect(calls).toBe(3);

      await jest.advanceTimersByTimeAsync(FIXED_DELAY_MS - 1);
      expect(calls).toBe(3);

      await jest.advanceTimersByTimeAsync(1);
      expect(calls).toBe(4);

      await expect(promise).resolves.toBe('ok');
      expect(getDelay).toHaveBeenCalledWith(1);
      expect(getDelay).toHaveBeenCalledWith(2);
      expect(getDelay).toHaveBeenCalledWith(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('passes incremental attempt numbers into shouldRetry for each failure', async () => {
    const attempts: number[] = [];
    const strategy: IRetryStrategy = {
      getDelay: () => 0,
      shouldRetry: jest.fn((_e: Error, attempt: number) => {
        attempts.push(attempt);
        return attempt < 3;
      }),
    };

    const retry = new Retry({ maxAttempts: 5, strategy });
    await expect(retry.execute(() => Promise.reject(new Error('again')))).rejects.toThrow(
      'again',
    );
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('when shouldRetry is false on the first failure, only one invocation runs', async () => {
    const strategy: IRetryStrategy = {
      getDelay: () => 500,
      shouldRetry: jest.fn((_e: Error, attempt: number) => attempt !== 1),
    };

    let calls = 0;
    const retry = new Retry({ maxAttempts: 5, strategy });
    jest.useFakeTimers();
    try {
      const p = retry.execute(async () => {
        calls++;
        await Promise.reject(new Error('once'));
      });
      await expect(p).rejects.toThrow('once');
    } finally {
      jest.useRealTimers();
    }

    expect(calls).toBe(1);
    expect(strategy.shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('maxAttempts: 1 runs the action exactly once before MaxRetriesExceeded', async () => {
    let calls = 0;
    const retry = new Retry({ maxAttempts: 1 });
    await expect(
      retry.execute(() => {
        calls += 1;
        return Promise.reject(new Error('fail'));
      }),
    ).rejects.toBeInstanceOf(MaxRetriesExceededError);

    expect(calls).toBe(1);
  });

  it('throws RangeError for maxAttempts < 1', () => {
    expect(() => new Retry({ maxAttempts: 0 })).toThrow(RangeError);
  });
});
