import { Bulkhead } from '../../../src/core/Bulkhead';
import { BulkheadFullError } from '../../../src/errors/BulkheadFullError';

describe('Bulkhead', () => {
  it('executes actions within the concurrent limit', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 2 });
    const results = await Promise.all([
      bulkhead.execute(() => Promise.resolve(1)),
      bulkhead.execute(() => Promise.resolve(2)),
    ]);
    expect(results).toEqual([1, 2]);
  });

  it('rejects immediately when full with no queue configured', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1 });
    let resolveFirst!: () => void;

    const first = bulkhead.execute(
      () =>
        new Promise<void>((res) => {
          resolveFirst = res;
        }),
    );

    await expect(
      bulkhead.execute(() => Promise.resolve()),
    ).rejects.toBeInstanceOf(BulkheadFullError);

    resolveFirst();
    await first;
  });

  it('queues operations when maxQueueSize > 0', async () => {
    const order: number[] = [];
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueueSize: 2 });

    const first = bulkhead.execute(async () => {
      order.push(1);
    });
    const second = bulkhead.execute(async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it('throws RangeError for maxConcurrent < 1', () => {
    expect(() => new Bulkhead({ maxConcurrent: 0 })).toThrow(RangeError);
  });
});
