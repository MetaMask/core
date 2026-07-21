import { createBatchedHandler } from './create-batch-handler';

const TEST_BATCH_MS = 50;

describe('createBatchedHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advanceAndFlush = async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(TEST_BATCH_MS);
  };

  const createNumberHandler = (
    onFlush = jest.fn().mockResolvedValue(undefined),
  ): { capture: (n: number) => Promise<void>; onFlush: jest.Mock } => {
    const capture = createBatchedHandler<number>(
      (buffer) => buffer.reduce((sum, item) => sum + item, 0),
      TEST_BATCH_MS,
      onFlush,
    );
    return { capture, onFlush };
  };

  function createObjectHandler(
    onFlush = jest.fn().mockResolvedValue(undefined),
  ): {
    capture: (item: { ids: number[] }) => Promise<void>;
    onFlush: jest.Mock;
  } {
    const capture = createBatchedHandler<{ ids: number[] }>(
      (buffer) => ({ ids: buffer.flatMap((item) => item.ids) }),
      TEST_BATCH_MS,
      onFlush,
    );
    return { capture, onFlush };
  }

  describe('buffering and aggregation', () => {
    it.each([
      {
        name: 'sums numbers and flushes once after debounce',
        arrangeAct: (): ReturnType<typeof createNumberHandler> & {
          act: () => Promise<void>;
        } => {
          const ctx = createNumberHandler();
          return {
            ...ctx,
            act: async (): Promise<void> => {
              await Promise.all([
                ctx.capture(1),
                ctx.capture(2),
                ctx.capture(3),
              ]);
            },
          };
        },
        expectedCalls: 1,
        expectedArg: 6,
      },
      {
        name: 'merges object arrays with custom aggregator',
        arrangeAct: (): ReturnType<typeof createObjectHandler> & {
          act: () => Promise<void>;
        } => {
          const ctx = createObjectHandler();
          return {
            ...ctx,
            act: async (): Promise<void> => {
              await Promise.all([
                ctx.capture({ ids: [1] }),
                ctx.capture({ ids: [2, 3] }),
              ]);
            },
          };
        },
        expectedCalls: 1,
        expectedArg: { ids: [1, 2, 3] },
      },
    ])('$name', async ({ arrangeAct, expectedCalls, expectedArg }) => {
      const { onFlush, act } = arrangeAct();
      expect(onFlush).not.toHaveBeenCalled();

      const promiseResult = act();
      expect(onFlush).not.toHaveBeenCalled();

      await advanceAndFlush();
      await promiseResult;

      expect(onFlush).toHaveBeenCalledTimes(expectedCalls);
      expect(onFlush).toHaveBeenCalledWith(expectedArg);
    });
  });

  describe('lifecycle and edge cases', () => {
    it('does not call onFlush when capture was never invoked', async () => {
      const onFlush = jest.fn().mockResolvedValue(undefined);
      createBatchedHandler<number>(
        (b) => b.reduce((a, item) => a + item, 0),
        TEST_BATCH_MS,
        onFlush,
      );

      await advanceAndFlush();

      expect(onFlush).not.toHaveBeenCalled();
    });

    it('resets buffer after flush and can capture again', async () => {
      const { capture, onFlush } = createNumberHandler();

      const promise1 = capture(1);
      await advanceAndFlush();
      await promise1;
      expect(onFlush).toHaveBeenCalledWith(1);

      const promise2 = capture(2);
      await advanceAndFlush();
      await promise2;
      expect(onFlush).toHaveBeenCalledTimes(2);
      expect(onFlush).toHaveBeenLastCalledWith(2);
    });

    it('returns a Promise that resolves when the batch flush completes', async () => {
      const { capture, onFlush } = createNumberHandler();

      const promise = capture(1);
      expect(onFlush).not.toHaveBeenCalled();

      await advanceAndFlush();
      await promise;
      expect(onFlush).toHaveBeenCalledWith(1);
    });

    const actAssertRejected = async (
      capture: (n: number) => Promise<void>,
      expectedError: unknown,
    ): Promise<void> => {
      const p1 = capture(1);
      const p2 = capture(2);
      const settled = Promise.allSettled([p1, p2]);

      await advanceAndFlush();
      const [r1, r2] = await settled;

      expect(r1.status).toBe('rejected');
      expect((r1 as PromiseRejectedResult).reason).toBe(expectedError);
      expect(r2.status).toBe('rejected');
      expect((r2 as PromiseRejectedResult).reason).toBe(expectedError);
    };

    it('rejects all callers in the same batch when onFlush throws', async () => {
      const error = new Error('flush failed');
      const onFlush = jest.fn().mockRejectedValue(error);
      const capture = createBatchedHandler<number>(
        (buffer) => buffer.reduce((sum, item) => sum + item, 0),
        TEST_BATCH_MS,
        onFlush,
      );

      await actAssertRejected(capture, error);
      expect(onFlush).toHaveBeenCalled();
    });

    it('rejects all callers in the same batch when aggregatorFn throws', async () => {
      const error = new Error('aggregation failed');
      const aggregatorFn = jest.fn(() => {
        throw error;
      });
      const onFlush = jest.fn().mockResolvedValue(undefined);
      const capture = createBatchedHandler<number>(
        aggregatorFn,
        TEST_BATCH_MS,
        onFlush,
      );

      await actAssertRejected(capture, error);
      expect(onFlush).not.toHaveBeenCalled();
    });
  });
});
