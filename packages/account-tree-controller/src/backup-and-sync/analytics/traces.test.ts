import type { TraceRequest } from '@metamask/controller-utils';

import { TraceName, traceFallback } from './traces';

describe('BackupAndSyncAnalytics - Traces', () => {
  describe('TraceName', () => {
    it('should contain expected trace names', () => {
      expect(TraceName).toEqual({
        AccountSyncFull: 'Multichain Account Syncing - Full',
      });
    });
  });

  describe('traceFallback', () => {
    let mockTraceRequest: TraceRequest;

    beforeEach(() => {
      mockTraceRequest = {
        name: TraceName.AccountSyncFull,
        id: 'trace-id-123',
        tags: {},
      };
    });

    it('should return undefined when no function is provided', async () => {
      const result = await traceFallback(mockTraceRequest);

      expect(result).toBeUndefined();
    });

    it('should execute the provided function and return its result', async () => {
      const mockResult = 'test-result';
      const mockFn = jest.fn().mockReturnValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith();
      expect(result).toBe(mockResult);
    });

    it('should execute async function and return its result', async () => {
      const mockResult = { data: 'async-result' };
      const mockAsyncFn = jest.fn().mockResolvedValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockAsyncFn);

      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);
    });

    it('should handle function that throws an error', async () => {
      const mockError = new Error('Test error');
      const mockFn = jest.fn().mockImplementation(() => {
        throw mockError;
      });

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle function that returns a rejected promise', async () => {
      const mockError = new Error('Async error');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
