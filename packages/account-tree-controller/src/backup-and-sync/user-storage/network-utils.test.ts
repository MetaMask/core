import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithRetry } from './network-utils.js';

describe('BackupAndSync - UserStorage - NetworkUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWithRetry', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns result on successful operation', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await executeWithRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeed', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce('success on third attempt');

      const result = await executeWithRetry(mockOperation, 3, 10);

      expect(result).toBe('success on third attempt');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('throws last error after max retries exceeded', async () => {
      const lastError = new Error('Final failure');
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockRejectedValueOnce(lastError);

      await expect(executeWithRetry(mockOperation, 2, 10)).rejects.toThrow(
        'Final failure',
      );
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('uses default parameters', async () => {
      vi.useFakeTimers();
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce('success on retry');

      const promise = executeWithRetry(mockOperation);
      await vi.advanceTimersByTimeAsync(999);
      expect(mockOperation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      expect(await promise).toBe('success on retry');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('works with custom parameters', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValue(new Error('Always fails'));

      await expect(executeWithRetry(mockOperation, 3, 1)).rejects.toThrow(
        'Always fails',
      );
      expect(mockOperation).toHaveBeenCalledTimes(4); // 1 + 3 retries
    });

    it('handles non-Error thrown objects', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce({ message: 'object error' })
        .mockRejectedValueOnce(42);

      await expect(executeWithRetry(mockOperation, 2, 10)).rejects.toThrow(
        '42',
      );
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('applies exponential backoff delay', async () => {
      const mockOperation = vi
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

    it('handles edge case where operation never succeeds with zero retries', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValue(new Error('Never succeeds'));

      await expect(executeWithRetry(mockOperation, 0, 10)).rejects.toThrow(
        'Never succeeds',
      );
      expect(mockOperation).toHaveBeenCalledTimes(1); // Only the initial attempt
    });

    it('handles immediate failure on first attempt with minimal retries', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValue(new Error('Immediate failure'));

      await expect(executeWithRetry(mockOperation, 1, 1)).rejects.toThrow(
        'Immediate failure',
      );
      expect(mockOperation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });
});
