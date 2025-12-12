import { HttpError } from '@metamask/controller-utils';

import { PollingWithCockatielPolicy } from './polling-with-policy';
import { delay } from '../tests/utils';

describe('PollingWithCockatielPolicy', () => {
  it('should return the success result', async () => {
    const policy = new PollingWithCockatielPolicy();
    const result = await policy.start('test', async () => {
      return 'test';
    });
    expect(result).toBe('test');
  });

  it('should retry the request and complete successfully', async () => {
    const policy = new PollingWithCockatielPolicy();
    let invocationCount = 0;
    const mockRequestFn = jest
      .fn()
      .mockImplementation(async (_abortSignal: AbortSignal) => {
        invocationCount += 1;
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (invocationCount < 3) {
              reject(new HttpError(412, 'Results are not available yet'));
            }
            resolve('test');
          }, 100);
        });
      });
    const result = await policy.start('test', mockRequestFn);
    expect(result).toBe('test');
    expect(mockRequestFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry when the error is not retryable', async () => {
    const policy = new PollingWithCockatielPolicy();
    const mockRequestFn = jest
      .fn()
      .mockImplementation(async (_abortSignal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          reject(new HttpError(500, 'Internal server error'));
        });
      });
    await expect(policy.start('test', mockRequestFn)).rejects.toThrow(
      'Internal server error',
    );
    expect(mockRequestFn).toHaveBeenCalledTimes(1);
  });

  it('should throw an error when the retry exceeds the max retries', async () => {
    const policy = new PollingWithCockatielPolicy({
      maxRetries: 3,
    });

    const requestFn = jest
      .fn()
      .mockImplementation(async (_abortSignal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new HttpError(412, 'Results are not available yet'));
          }, 100);
        });
      });

    const result = policy.start('test', requestFn);
    await expect(result).rejects.toThrow('Results are not available yet');
    expect(requestFn).toHaveBeenCalledTimes(4);
  });

  it('should throw a `Request Cancelled` error when the request is aborted', async () => {
    const policy = new PollingWithCockatielPolicy({
      maxRetries: 3,
    });

    const requestFn = jest
      .fn()
      .mockImplementation(async (abortSignal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            if (abortSignal.aborted) {
              reject(new Error('test error'));
            }

            reject(new HttpError(412, 'Results are not available yet'));
          }, 100);
        });
      });

    const result = policy.start('test', requestFn);
    await delay(10);
    policy.abortPendingRequest('test');
    await expect(result).rejects.toThrow('Request cancelled');
  });

  it('should throw a `Request Cancelled` error when a new request is started with the same request id', async () => {
    const policy = new PollingWithCockatielPolicy();

    const requestFn = jest
      .fn()
      .mockImplementation(async (abortSignal: AbortSignal) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (abortSignal.aborted) {
              reject(new Error('test error'));
            }
            resolve('test');
          }, 100);
        });
      });

    const result = policy.start('test', requestFn);
    await delay(10);
    const secondResult = policy.start('test', requestFn);
    await expect(result).rejects.toThrow('Request cancelled');
    expect(await secondResult).toBe('test');
  });

  it('should resolve the result when two requests are started with the different request ids', async () => {
    const policy = new PollingWithCockatielPolicy();

    const requestFn = (result: string): jest.Mock =>
      jest.fn().mockImplementation(async (abortSignal: AbortSignal) => {
        return new Promise((resolve, reject) => {
          if (abortSignal.aborted) {
            reject(new Error('test error'));
          }
          setTimeout(() => {
            resolve(result);
          }, 100);
        });
      });

    const result = policy.start('test', requestFn('test'));
    const secondResult = policy.start('test2', requestFn('test2'));
    expect(await result).toBe('test');
    expect(await secondResult).toBe('test2');
  });
});
