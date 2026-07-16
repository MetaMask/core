import { jest } from '@jest/globals';

import { sleep } from './utils.js';

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the given delay', async () => {
    const onResolved = jest.fn();
    const promise = sleep(1000).then(onResolved);

    await jest.advanceTimersByTimeAsync(999);
    expect(onResolved).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await promise;
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('resolves with undefined', async () => {
    const promise = sleep(0);

    await jest.advanceTimersByTimeAsync(0);

    expect(await promise).toBeUndefined();
  });

  it('schedules the timeout with the provided delay', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');

    const promise = sleep(1234);

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1234);

    await jest.advanceTimersByTimeAsync(1234);
    await promise;
  });
});
