import { MfaRecoveryError } from './errors.js';
import { withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  it('resolves with the value when run completes before the timeout', async () => {
    const result = await withTimeout(async () => 'ok', {
      ms: 1_000,
      kind: 'request',
    });
    expect(result).toBe('ok');
  });

  it('passes a child AbortSignal to run', async () => {
    const parent = new AbortController();
    let childSignal: AbortSignal | undefined;
    await withTimeout(
      async (signal) => {
        childSignal = signal;
        return null;
      },
      { ms: 1_000, signal: parent.signal, kind: 'request' },
    );
    expect(childSignal).toBeDefined();
    expect(childSignal).not.toBe(parent.signal);
    expect(childSignal?.aborted).toBe(false);
  });

  it('rejects with the run error when run fails before the timeout', async () => {
    const providerError = new Error('provider failed');
    await expect(
      withTimeout(
        async () => {
          throw providerError;
        },
        { ms: 1_000, kind: 'prompt' },
      ),
    ).rejects.toBe(providerError);
  });

  it('rejects with the run error and cleans up when run throws synchronously', async () => {
    jest.useFakeTimers();
    try {
      const parent = new AbortController();
      const removeListenerSpy = jest.spyOn(
        parent.signal,
        'removeEventListener',
      );
      const providerError = new Error('provider threw');

      await expect(
        withTimeout(
          () => {
            throw providerError;
          },
          { ms: 1_000, signal: parent.signal, kind: 'request' },
        ),
      ).rejects.toBe(providerError);
      expect(jest.getTimerCount()).toBe(0);
      expect(removeListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects with prompt_timeout when the timer expires for prompt kind', async () => {
    jest.useFakeTimers();
    try {
      const run = jest.fn(
        (signal: AbortSignal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('aborted in run'));
            });
          }),
      );

      const promise = withTimeout(run, { ms: 500, kind: 'prompt' });
      const result = promise.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(500);
      expect(await result).toMatchObject({
        name: 'MfaRecoveryError',
        code: 'prompt_timeout',
        message: 'Prompt timed out',
      });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][0].aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects with request_timeout when the timer expires for request kind', async () => {
    jest.useFakeTimers();
    try {
      const promise = withTimeout(
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('aborted in run'));
            });
          }),
        { ms: 250, kind: 'request' },
      );
      const result = promise.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(250);
      expect(await result).toMatchObject({
        code: 'request_timeout',
        message: 'Request timed out',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects with operation_aborted when the parent signal aborts during run', async () => {
    const parent = new AbortController();
    let childSignal: AbortSignal | undefined;

    const promise = withTimeout(
      async (signal) => {
        childSignal = signal;
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve());
        });
        return 'late';
      },
      { ms: 10_000, signal: parent.signal, kind: 'request' },
    );

    parent.abort();
    await expect(promise).rejects.toMatchObject({
      code: 'operation_aborted',
      message: 'Operation aborted',
    });
    expect(childSignal?.aborted).toBe(true);
  });

  it('rejects with operation_aborted when run synchronously aborts the parent', async () => {
    jest.useFakeTimers();
    try {
      const parent = new AbortController();
      let childSignal: AbortSignal | undefined;
      let settled = false;

      const promise = withTimeout(
        (signal) => {
          childSignal = signal;
          parent.abort();
          return new Promise<never>(() => undefined);
        },
        { ms: 10_000, signal: parent.signal, kind: 'request' },
      );
      const settledPromise = promise.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await jest.advanceTimersByTimeAsync(0);
      await settledPromise;
      expect(settled).toBe(true);
      await expect(promise).rejects.toMatchObject({
        code: 'operation_aborted',
        message: 'Operation aborted',
      });
      expect(childSignal?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects with operation_aborted when the parent is already aborted', async () => {
    const parent = new AbortController();
    parent.abort();
    const run = jest.fn(async () => 'value');

    await expect(
      withTimeout(run, { ms: 1_000, signal: parent.signal, kind: 'prompt' }),
    ).rejects.toMatchObject({
      code: 'operation_aborted',
      message: 'Operation aborted',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('does not leave unhandled rejections when run settles after a timeout', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const promise = withTimeout(
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('late provider failure'));
            });
          }),
        { ms: 100, kind: 'request' },
      );
      const result = promise.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(100);
      expect(await result).toBeInstanceOf(MfaRecoveryError);
      await jest.advanceTimersByTimeAsync(0);
      expect(unhandled).toStrictEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('does not change the timeout rejection when run ignores abort and resolves later', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      let resolveLate!: (value: string) => void;
      const promise = withTimeout(
        () =>
          new Promise<string>((resolve) => {
            resolveLate = resolve;
          }),
        { ms: 100, kind: 'request' },
      );
      const result = promise.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(100);
      expect(await result).toMatchObject({
        code: 'request_timeout',
        message: 'Request timed out',
      });

      resolveLate('late value');
      await jest.advanceTimersByTimeAsync(0);

      expect(await result).toMatchObject({ code: 'request_timeout' });
      expect(unhandled).toStrictEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('clears the timer when the parent signal aborts', async () => {
    jest.useFakeTimers();
    try {
      const parent = new AbortController();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const promise = withTimeout(
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('aborted in run'));
            });
          }),
        { ms: 5_000, signal: parent.signal, kind: 'request' },
      );

      const result = promise.catch((error: unknown) => error);
      parent.abort();
      expect(await result).toMatchObject({
        code: 'operation_aborted',
        message: 'Operation aborted',
      });
      expect(clearTimeoutSpy).toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5_000);
      clearTimeoutSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the timer after run resolves', async () => {
    jest.useFakeTimers();
    try {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      await withTimeout(async () => 'done', { ms: 5_000, kind: 'request' });
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes the parent abort listener after run resolves', async () => {
    const parent = new AbortController();
    const addListenerSpy = jest.spyOn(parent.signal, 'addEventListener');
    const removeListenerSpy = jest.spyOn(parent.signal, 'removeEventListener');

    await withTimeout(async () => 'done', {
      ms: 1_000,
      signal: parent.signal,
      kind: 'request',
    });

    const abortAdds = addListenerSpy.mock.calls.filter(
      ([event]) => event === 'abort',
    );
    expect(abortAdds.length).toBeGreaterThan(0);
    expect(removeListenerSpy).toHaveBeenCalledWith('abort', abortAdds[0][1]);

    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });
});
