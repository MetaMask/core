import type { TraceRequest } from '@metamask/controller-utils';

import { traceFallback } from './traces';
import { TraceName } from '../constants/traces';

describe('MultichainAccountService - Traces', () => {
  describe('TraceName', () => {
    it('contains expected trace names', () => {
      expect(TraceName).toStrictEqual({
        SnapDiscoverAccounts: 'Snap Discover Accounts',
        EvmDiscoverAccounts: 'EVM Discover Accounts',
      });
    });
  });

  describe('traceFallback', () => {
    let mockTraceRequest: TraceRequest;

    beforeEach(() => {
      mockTraceRequest = {
        name: TraceName.SnapDiscoverAccounts,
        id: 'trace-id-123',
        tags: {},
      };
    });

    it('returns undefined when no function is provided', async () => {
      const result = await traceFallback(mockTraceRequest);

      expect(result).toBeUndefined();
    });

    it('executes the provided function and return its result', async () => {
      const mockResult = 'test-result';
      const mockFn = jest.fn().mockReturnValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith();
      expect(result).toBe(mockResult);
    });

    it('executes async function and return its result', async () => {
      const mockResult = { data: 'async-result' };
      const mockAsyncFn = jest.fn().mockResolvedValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockAsyncFn);

      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);
    });

    it('handles function that throws an error', async () => {
      const mockError = new Error('Test error');
      const mockFn = jest.fn().mockImplementation(() => {
        throw mockError;
      });

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('handles function that returns a rejected promise', async () => {
      const mockError = new Error('Async error');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
