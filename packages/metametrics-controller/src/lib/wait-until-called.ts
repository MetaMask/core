const DEFAULT_TIMEOUT = 10000;

/**
 * Waits until a given stub function is called a specified number of times.
 *
 * @param stub - The stub function to wait for.
 * @param [wrappedThis] - The value of 'this' to be passed to the wrapped method.
 * @param [options] - The options for waiting.
 * @param [options.callCount] - The number of times the stub function should be called.
 * @param [options.timeout] - The maximum time to wait in milliseconds. If null, no timeout is set.
 * @returns A promise that resolves when the stub function is called the specified number of times. If the timeout is exceeded, the promise is rejected with an error.
 */
export function waitUntilCalled(
  stub,
  wrappedThis = null,
  { callCount = 1, timeout = DEFAULT_TIMEOUT } = {},
) {
  let numCalls = 0;
  let resolve: (arg0: Error | undefined) => void;
  let timeoutHandle: string | number | NodeJS.Timeout | undefined;
  const stubHasBeenCalled = new Promise((_resolve) => {
    resolve = _resolve;
    if (timeout !== null) {
      timeoutHandle = setTimeout(
        () => resolve(new Error('Timeout exceeded')),
        timeout,
      );
    }
  });
  stub.callsFake((...args: any) => {
    try {
      if (stub.wrappedMethod) {
        stub.wrappedMethod.call(wrappedThis, ...args);
      }
    } finally {
      if (numCalls < callCount) {
        numCalls += 1;
        if (numCalls === callCount) {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          resolve();
        }
      }
    }
  });

  return async () => {
    const error = await stubHasBeenCalled;
    if (error) {
      throw error;
    }
  };
}
