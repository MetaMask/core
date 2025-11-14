import { timeoutWithRetry } from './timeout-with-retry';
import { flushPromises } from '../../../../tests/helpers';

describe('timeoutWithRetry', () => {
  const timeout = 1000;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the result when call completes before timeout', async () => {
    const mockCall = jest.fn(async () => 'success');

    const resultPromise = timeoutWithRetry(mockCall, timeout, 0);
    jest.runAllTimers();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  describe('retry behaviour', () => {
    it('throws when maxRetries is negative', async () => {
      const mockCall = jest.fn(async () => 'success');

      await expect(() =>
        timeoutWithRetry(mockCall, timeout, -1),
      ).rejects.toThrow('maxRetries must be greater than or equal to 0');
    });

    it('returns the result when call completes just before timeout', async () => {
      const mockCall = createMockCallWithRetries(timeout, 0);

      const resultPromise = timeoutWithRetry(mockCall, timeout, 0);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(mockCall).toHaveBeenCalledTimes(1);
    });

    it('succeeds after multiple retries', async () => {
      const mockCall = createMockCallWithRetries(timeout, 2);

      const resultPromise = timeoutWithRetry(mockCall, timeout, 3);
      jest.runAllTimers();
      await flushPromises();
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(mockCall).toHaveBeenCalledTimes(3);
    });

    it('throws when all retries are exhausted', async () => {
      const mockCall = createMockCallWithRetries(timeout, 2);

      const resultPromise = timeoutWithRetry(mockCall, timeout, 1);
      jest.runAllTimers();
      await flushPromises();
      jest.runAllTimers();

      await expect(resultPromise).rejects.toThrow('timeout');
      expect(mockCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-timeout errors', () => {
    it('throws immediately on non-timeout error without retrying', async () => {
      const customError = new Error('custom error');
      const mockCall = jest.fn(async () => {
        throw customError;
      });

      const resultPromise = timeoutWithRetry(mockCall, timeout, 0);
      jest.runAllTimers();

      await expect(resultPromise).rejects.toThrow('custom error');
      expect(mockCall).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * @param timeout - The timeout in milliseconds.
 * @param timeoutsBeforeSuccess - The number of timeouts before the call succeeds.
 * @returns A mock call function that times out for a specific number of times before returning 'success'.
 */
function createMockCallWithRetries(
  timeout: number,
  timeoutsBeforeSuccess: number,
) {
  let callCount = 0;
  const mockCall = jest.fn(async () => {
    callCount += 1;

    if (callCount < timeoutsBeforeSuccess + 1) {
      await new Promise((resolve) => setTimeout(resolve, timeout + 1));
    }

    return 'success';
  });

  return mockCall;
}
