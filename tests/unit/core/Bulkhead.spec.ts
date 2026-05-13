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

  it('rejects with BulkheadFullError when slots and queue are both full', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueueSize: 1 });
    let resolveFirst!: () => void;

    const first = bulkhead.execute(
      () =>
        new Promise<void>((res) => {
          resolveFirst = res;
        }),
    );

    let secondCompleted = false;
    const second = bulkhead.execute(async () => {
      secondCompleted = true;
    });

    await expect(
      bulkhead.execute(() => Promise.resolve()),
    ).rejects.toBeInstanceOf(BulkheadFullError);

    expect(secondCompleted).toBe(false);

    resolveFirst();
    await second;
    expect(secondCompleted).toBe(true);
    await first;
  });

  it('drains the queue in FIFO order when one slot is available', async () => {
    const order: number[] = [];
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueueSize: 3 });
    let resolveFirst!: () => void;

    const p1 = bulkhead.execute(async () => {
      order.push(1);
      await new Promise<void>((res) => {
        resolveFirst = res;
      });
    });

    const p2 = bulkhead.execute(async () => {
      order.push(2);
    });
    const p3 = bulkhead.execute(async () => {
      order.push(3);
    });
    const p4 = bulkhead.execute(async () => {
      order.push(4);
    });

    expect(order).toEqual([1]);

    resolveFirst();
    await Promise.all([p1, p2, p3, p4]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('uses free slots below maxConcurrent before queueing excess work', async () => {
    const unblock: Array<() => void> = [];
    const wait = (): Promise<void> =>
      new Promise<void>((resolve) => {
        unblock.push(resolve);
      });

    const bulkhead = new Bulkhead({ maxConcurrent: 3, maxQueueSize: 1 });

    let thirdStarted = false;
    let fourthStarted = false;
    let fifthStarted = false;

    const blocker1 = bulkhead.execute(wait);
    const blocker2 = bulkhead.execute(wait);

    await Promise.resolve();
    expect(bulkhead.getRunningCount()).toBe(2);

    const blocker3 = bulkhead.execute(async () => {
      thirdStarted = true;
      await wait();
    });

    await Promise.resolve();

    expect(thirdStarted).toBe(true);
    expect(bulkhead.getRunningCount()).toBe(3);
    expect(bulkhead.getQueuedCount()).toBe(0);

    const queuedFourth = bulkhead.execute(async () => {
      fourthStarted = true;
    });

    await Promise.resolve();

    expect(fourthStarted).toBe(false);
    expect(bulkhead.getQueuedCount()).toBe(1);

    await expect(
      bulkhead.execute(async () => {
        fifthStarted = true;
      }),
    ).rejects.toBeInstanceOf(BulkheadFullError);

    await Promise.resolve();
    expect(fifthStarted).toBe(false);

    unblock.shift()!();
    await Promise.resolve();

    await queuedFourth;
    expect(fourthStarted).toBe(true);

    unblock.shift()!();
    unblock.shift()!();
    await Promise.all([blocker1, blocker2, blocker3]);
  });

  it('throws RangeError for maxConcurrent < 1', () => {
    expect(() => new Bulkhead({ maxConcurrent: 0 })).toThrow(RangeError);
  });
});
