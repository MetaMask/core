import { PollingWithTimeoutAndAbort } from './polling-with-timeout-abort';
import { delay } from '../tests/utils';

describe('PollingWithTimeoutAndAbort', () => {
  it('should timeout when the request does not resolve within the timeout period', async () => {
    const pollingWithTimeout = new PollingWithTimeoutAndAbort({
      timeout: 100,
      pollInterval: 10,
    });

    const requestFn = jest
      .fn()
      .mockImplementation(async (_signal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('test error'));
          }, 10);
        });
      });

    await expect(
      pollingWithTimeout.pollRequest('test', requestFn, {
        fnName: 'test',
        timeout: 100,
      }),
    ).rejects.toThrow('test: Request timed out');
  });

  it('should timeout with default polling options', async () => {
    const pollingWithTimeout = new PollingWithTimeoutAndAbort({
      timeout: 100,
      pollInterval: 10,
    });
    const requestFn = jest
      .fn()
      .mockImplementation(async (_signal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('test error'));
          }, 10);
        });
      });

    await expect(
      pollingWithTimeout.pollRequest('test', requestFn),
    ).rejects.toThrow(': Request timed out');
  });

  it('should abort pending requests when new request is made', async () => {
    const pollingWithTimeout = new PollingWithTimeoutAndAbort({
      timeout: 1000,
      pollInterval: 20,
    });

    const requestFn = jest
      .fn()
      .mockImplementation(async (signal: AbortSignal) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            // eslint-disable-next-line jest/no-conditional-in-test -- we want to simulate the abort signal being triggered during the request
            if (signal.aborted) {
              reject(new Error('test error'));
            }
            resolve('test result');
          }, 100);
        });
      });

    const firstAttempt = pollingWithTimeout.pollRequest('test', requestFn, {
      fnName: 'test',
    });
    await delay(15); // small delay to let the first request start
    const secondAttempt = pollingWithTimeout.pollRequest('test', requestFn, {
      fnName: 'test',
    });

    await expect(firstAttempt).rejects.toThrow('test: Request cancelled'); // first request should be aborted by the second request
    const result = await secondAttempt;
    expect(result).toBe('test result'); // second request should succeed
  });

  it('should abort pending requests when abortPendingRequests is called', async () => {
    const pollingWithTimeout = new PollingWithTimeoutAndAbort({
      timeout: 1000,
      pollInterval: 20,
    });

    const requestFn = jest
      .fn()
      .mockImplementation(async (_signal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('test error'));
          }, 100);
        });
      });

    const request = pollingWithTimeout.pollRequest('test', requestFn, {
      fnName: 'test',
    });
    await delay(15); // small delay to let the request start
    pollingWithTimeout.abortPendingRequests('test');
    await expect(request).rejects.toThrow('test: Request cancelled');
  });
});
