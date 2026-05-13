import { Timeout } from '../../../src/core/Timeout';
import { TimeoutError } from '../../../src/errors/TimeoutError';

describe('Timeout', () => {
  it('returns the result when action completes in time', async () => {
    const timeout = new Timeout(500);
    const result = await timeout.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('throws TimeoutError when the action exceeds the limit', async () => {
    const timeout = new Timeout(50);
    const slow = () =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('never')), 200),
      );

    await expect(timeout.execute(slow)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('propagates action errors that occur before the timeout', async () => {
    const timeout = new Timeout(500);
    await expect(
      timeout.execute(() => Promise.reject(new Error('fast failure'))),
    ).rejects.toThrow('fast failure');
  });

  it('throws RangeError for non-positive timeoutMs', () => {
    expect(() => new Timeout(0)).toThrow(RangeError);
    expect(() => new Timeout(-1)).toThrow(RangeError);
  });
});
