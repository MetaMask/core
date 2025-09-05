import { executeWithRetry } from './network-utils';

describe('BackupAndSync - UserStorage - NetworkUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeWithRetry', () => {
    it('should return result on successful operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await executeWithRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce('success on third attempt');

      const result = await executeWithRetry(mockOperation, 3, 10);

      expect(result).toBe('success on third attempt');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max retries exceeded', async () => {
      const lastError = new Error('Final failure');
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockRejectedValueOnce(lastError);

      await expect(executeWithRetry(mockOperation, 2, 10)).rejects.toThrow(
        'Final failure',
      );
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should use default parameters', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce('success on retry');

      // Mock setTimeout to avoid actual delays but verify default parameters are used
      const originalSetTimeout = setTimeout;
      const mockSetTimeout = jest.fn().mockImplementation((callback) => {
        callback(); // Execute immediately
        return 'timeout-id';
      });
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      global.setTimeout = mockSetTimeout as any;

      try {
        const result = await executeWithRetry(mockOperation);

        expect(result).toBe('success on retry');
        expect(mockOperation).toHaveBeenCalledTimes(2);
        // Verify default delay (1000ms) was used
        expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should work with custom parameters', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Always fails'));

      await expect(executeWithRetry(mockOperation, 3, 1)).rejects.toThrow(
        'Always fails',
      );
      expect(mockOperation).toHaveBeenCalledTimes(4); // 1 + 3 retries
    });

    it('should handle non-Error thrown objects', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce({ message: 'object error' })
        .mockRejectedValueOnce(42);

      await expect(executeWithRetry(mockOperation, 2, 10)).rejects.toThrow(
        '42',
      );
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff delay', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      const result = await executeWithRetry(mockOperation, 3, 50);
      const endTime = Date.now();

      expect(result).toBe('success');
      expect(endTime - startTime).toBeGreaterThan(50 + 100 - 10); // Allow for timing variance
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle edge case where operation never succeeds with zero retries', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Never succeeds'));

      await expect(executeWithRetry(mockOperation, 0, 10)).rejects.toThrow(
        'Never succeeds',
      );
      expect(mockOperation).toHaveBeenCalledTimes(1); // Only the initial attempt
    });

    it('should handle immediate failure on first attempt with minimal retries', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Immediate failure'));

      await expect(executeWithRetry(mockOperation, 1, 1)).rejects.toThrow(
        'Immediate failure',
      );
      expect(mockOperation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });
});
