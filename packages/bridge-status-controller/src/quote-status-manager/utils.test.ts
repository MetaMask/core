import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sleep } from './utils.js';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the given delay', async () => {
    const onResolved = vi.fn();
    const promise = sleep(1000).then(onResolved);

    await vi.advanceTimersByTimeAsync(999);
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('resolves with undefined', async () => {
    const promise = sleep(0);

    await vi.advanceTimersByTimeAsync(0);

    expect(await promise).toBeUndefined();
  });

  it('schedules the timeout with the provided delay', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = sleep(1234);

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1234);

    await vi.advanceTimersByTimeAsync(1234);
    await promise;
  });
});
