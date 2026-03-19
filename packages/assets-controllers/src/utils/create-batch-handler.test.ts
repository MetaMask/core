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
  ): { capture: (n: number) => void; onFlush: jest.Mock } => {
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
    capture: (item: { ids: number[] }) => void;
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
          act: () => void;
        } => {
          const ctx = createNumberHandler();
          return {
            ...ctx,
            act: (): void => {
              ctx.capture(1);
              ctx.capture(2);
              ctx.capture(3);
            },
          };
        },
        expectedCalls: 1,
        expectedArg: 6,
      },
      {
        name: 'merges object arrays with custom aggregator',
        arrangeAct: (): ReturnType<typeof createObjectHandler> & {
          act: () => void;
        } => {
          const ctx = createObjectHandler();
          return {
            ...ctx,
            act: (): void => {
              ctx.capture({ ids: [1] });
              ctx.capture({ ids: [2, 3] });
            },
          };
        },
        expectedCalls: 1,
        expectedArg: { ids: [1, 2, 3] },
      },
    ])('$name', async ({ arrangeAct, expectedCalls, expectedArg }) => {
      const { onFlush, act } = arrangeAct();
      expect(onFlush).not.toHaveBeenCalled();

      act();
      expect(onFlush).not.toHaveBeenCalled();

      await advanceAndFlush();

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

      capture(1);
      await advanceAndFlush();
      expect(onFlush).toHaveBeenCalledWith(1);

      capture(2);
      await advanceAndFlush();
      expect(onFlush).toHaveBeenCalledTimes(2);
      expect(onFlush).toHaveBeenLastCalledWith(2);
    });
  });
});
