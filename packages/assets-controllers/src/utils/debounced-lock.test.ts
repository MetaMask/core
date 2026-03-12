import { debounceAndLock } from './debounced-lock';
import { flushPromises } from '../../../../tests/helpers';

describe('debounceAndLock', () => {
  const WAIT_MS = 100;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  type DebouncedStringFn = (...args: unknown[]) => Promise<string>;

  it.each([
    {
      description: 'returns the result of the async function',
      makeAsyncFn: (): (() => Promise<string>) => jest.fn(async () => 'result'),
      invoke: (debouncedFn: DebouncedStringFn): Promise<string> =>
        debouncedFn(),
      expectedResult: 'result',
      expectedArgs: undefined as unknown[] | undefined,
    },
    {
      description: 'forwards arguments to the async function',
      makeAsyncFn: (): ((a: number, b: string) => Promise<string>) =>
        jest.fn(async (a: number, b: string) => `${a}-${b}`),
      invoke: (debouncedFn: DebouncedStringFn): Promise<string> =>
        debouncedFn(1, 'x'),
      expectedResult: '1-x',
      expectedArgs: [1, 'x'],
    },
  ])(
    '$description',
    async ({ makeAsyncFn, invoke, expectedResult, expectedArgs }) => {
      const asyncFn = makeAsyncFn();
      const fn = debounceAndLock(
        asyncFn as (...args: unknown[]) => Promise<string>,
        WAIT_MS,
      );

      const resultPromise = invoke(fn);
      jest.runAllTimers();
      await flushPromises();
      const result = await resultPromise;

      expect(result).toBe(expectedResult);
      expect(asyncFn).toHaveBeenCalledTimes(1);
      expect(asyncFn).toHaveBeenCalledWith(...(expectedArgs ?? []));
    },
  );

  it.each([
    { description: 'uses default wait when not provided', wait: undefined },
    { description: 'uses custom wait when provided', wait: WAIT_MS },
  ])('$description', async ({ wait }) => {
    const asyncFn = jest.fn(async () => 'ok');
    const fn =
      wait === undefined
        ? debounceAndLock(asyncFn)
        : debounceAndLock(asyncFn, wait);

    const resultPromise = fn();
    jest.runAllTimers();
    await flushPromises();
    await resultPromise;

    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('debounces: only the first call in a burst runs (leading edge)', async () => {
    const asyncFn = jest.fn(async () => 'done');
    const fn = debounceAndLock(asyncFn, WAIT_MS);

    const resultPromise1 = fn();
    const resultPromise2 = fn();
    const resultPromise3 = fn();
    jest.runAllTimers();
    await flushPromises();
    await Promise.all([resultPromise1, resultPromise2, resultPromise3]);

    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('after resolve, the next call runs immediately (debounce reset)', async () => {
    const asyncFn = jest.fn().mockResolvedValue('done');
    const fn = debounceAndLock(asyncFn, WAIT_MS);

    const p1 = fn();
    jest.runAllTimers();
    await flushPromises();
    const firstResult = await p1;
    expect(firstResult).toBe('done');

    const p2 = fn();
    jest.runAllTimers();
    await flushPromises();
    const secondResult = await p2;
    expect(secondResult).toBe('done');

    expect(asyncFn).toHaveBeenCalledTimes(2);
  });

  it('after reject, the lock clears so the next call runs', async () => {
    const asyncFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('second');
    const fn = debounceAndLock(asyncFn, WAIT_MS);

    const p1 = fn();
    // Attach handler before advancing timers so the rejection is not unhandled
    // eslint-disable-next-line jest/valid-expect -- await after flush below
    const expectRejection = expect(p1).rejects.toThrow('first');
    jest.runAllTimers();
    await flushPromises();
    await expectRejection;

    const p2 = fn();
    jest.runAllTimers();
    await flushPromises();
    const secondResult = await p2;
    expect(secondResult).toBe('second');

    expect(asyncFn).toHaveBeenCalledTimes(2);
  });

  it('lock: concurrent call returns the same in-flight promise', async () => {
    const resolveHolder: { resolve: (value: string) => void } = {
      resolve: (_value: string) => {
        /* set by Promise constructor below */
      },
    };
    const firstPromise = new Promise<string>((resolve) => {
      resolveHolder.resolve = resolve;
    });
    const asyncFn = jest.fn(async () => firstPromise);
    const fn = debounceAndLock(asyncFn, WAIT_MS);

    const resultPromise1 = fn();
    jest.runOnlyPendingTimers();
    await flushPromises();

    jest.advanceTimersByTime(WAIT_MS + 1);
    const resultPromise2 = fn();
    jest.runOnlyPendingTimers();
    await flushPromises();

    expect(asyncFn).toHaveBeenCalledTimes(1);

    resolveHolder.resolve('resolved');
    await flushPromises();
    const result1 = await resultPromise1;
    const result2 = await resultPromise2;
    expect(result1).toBe('resolved');
    expect(result2).toBe('resolved');
  });

  it('rejects when the async function throws', async () => {
    const error = new Error('async failed');
    const asyncFn = jest.fn(async () => {
      throw error;
    });
    const fn = debounceAndLock(asyncFn, WAIT_MS);

    const resultPromise = fn();
    await expect(resultPromise).rejects.toThrow('async failed');
    jest.runAllTimers();
    await flushPromises();

    expect(asyncFn).toHaveBeenCalledTimes(1);
  });
});
