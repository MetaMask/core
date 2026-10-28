import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import { DataLakeService } from '../../../src/services/DataLakeService.js';
import type { ServiceContext } from '../../../src/services/ServiceContext.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
/* eslint-disable */
import {
  createMockServiceContext,
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
  callMissingFrom,
  createPartiallyDelegatedMessenger,
} from '../../helpers/serviceMocks.js';

vi.mock('uuid', () => ({ v4: () => 'mock-trace-id' }));

describe('DataLakeService', () => {
  let mockContext: ServiceContext;
  let mockDeps: Mocked<PerpsPlatformDependencies>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  let dataLakeService: DataLakeService;
  const mockEvmAccount = createMockEvmAccount();
  const mockToken = 'mock-bearer-token';
  const mockFetch = vi.fn();

  /**
   * Sets up the default messenger mock that returns a valid account and token.
   * Called in beforeEach.
   */
  function setupDefaultMessenger() {
    (mockMessenger.call as Mock).mockImplementation((action: string) => {
      if (
        action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
      ) {
        return [mockEvmAccount];
      }
      if (action === 'AuthenticationController:getBearerToken') {
        return Promise.resolve(mockToken);
      }
      return undefined;
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();

    mockDeps = createMockInfrastructure();
    mockMessenger = createMockMessenger();
    dataLakeService = new DataLakeService(mockDeps, mockMessenger);

    mockContext = createMockServiceContext({
      errorContext: { controller: 'DataLakeService', method: 'test' },
      tracingContext: {
        provider: 'hyperliquid',
        isTestnet: false,
      },
    });

    setupDefaultMessenger();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  describe('reportOrder', () => {
    it('skips reporting for testnet', async () => {
      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: true,
        context: mockContext,
      });

      expect(result).toEqual({ success: true, error: 'Skipped for testnet' });
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Skipping for testnet',
        expect.objectContaining({ network: 'testnet' }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('reports order successfully on first attempt', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        slPrice: 45000,
        tpPrice: 55000,
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({ success: true });
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'AuthenticationController:getBearerToken',
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockToken}`,
          }),
          body: JSON.stringify({
            user_id: mockEvmAccount.address,
            symbol: 'BTC',
            sl_price: 45000,
            tp_price: 55000,
          }),
        }),
      );
      expect(mockDeps.tracer.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Perps Data Lake Report',
          tags: expect.objectContaining({ action: 'open', symbol: 'BTC' }),
        }),
      );
      expect(mockDeps.tracer.endTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: true, retries: 0 }),
        }),
      );
    });

    it('includes performance measurement on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      await dataLakeService.reportOrder({
        action: 'close',
        symbol: 'ETH',
        isTestnet: false,
        context: mockContext,
      });

      expect(mockDeps.tracer.setMeasurement).toHaveBeenCalledWith(
        'perps.api.data_lake_call',
        expect.any(Number),
        'millisecond',
      );
    });

    it('returns error when account is missing', async () => {
      (mockMessenger.call as Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [];
        }
        if (action === 'AuthenticationController:getBearerToken') {
          return Promise.resolve(mockToken);
        }
        return undefined;
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({
        success: false,
        error: 'No account or token available',
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Missing requirements',
        expect.objectContaining({ hasAccount: false }),
      );
    });

    it('returns error when token is missing', async () => {
      (mockMessenger.call as Mock).mockImplementation((action: string) => {
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [mockEvmAccount];
        }
        if (action === 'AuthenticationController:getBearerToken') {
          return Promise.resolve(null);
        }
        return undefined;
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({
        success: false,
        error: 'No account or token available',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('skips reporting without logging an error when getBearerToken is not delegated', async () => {
      dataLakeService = new DataLakeService(
        mockDeps,
        createPartiallyDelegatedMessenger({
          'AccountTreeController:getAccountsFromSelectedAccountGroup': () => [
            mockEvmAccount,
          ],
        }),
      );

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({
        success: false,
        error: 'No account or token available',
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(mockDeps.logger.error).not.toHaveBeenCalled();
      expect(mockDeps.tracer.endTrace).toHaveBeenCalledTimes(1);
      expect(mockDeps.tracer.endTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-trace-id',
          data: { success: false, error: 'No account or token available' },
        }),
      );
    });

    it.each([
      [
        'fails',
        'Not signed in',
        async () => {
          throw new Error('Not signed in');
        },
      ],
      [
        'fails on a missing dependency of its own',
        'A handler for KeyringController:getState has not been delegated to AuthenticationController',
        // A real nested `Messenger` call.
        async () =>
          callMissingFrom(
            'AuthenticationController',
            'KeyringController:getState',
          ),
      ],
    ])(
      'still logs and retries when a delegated getBearerToken handler %s',
      async (_case, message, getBearerToken) => {
        dataLakeService = new DataLakeService(
          mockDeps,
          createPartiallyDelegatedMessenger({
            'AccountTreeController:getAccountsFromSelectedAccountGroup': () => [
              mockEvmAccount,
            ],
            'AuthenticationController:getBearerToken': getBearerToken,
          }),
        );

        const result = await dataLakeService.reportOrder({
          action: 'open',
          symbol: 'BTC',
          isTestnet: false,
          context: mockContext,
        });

        expect(result).toEqual({ success: false, error: message });
        expect(mockDeps.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message }),
          expect.anything(),
        );
        expect(vi.getTimerCount()).toBe(1);
      },
    );

    it('retries on network error with exponential backoff', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: vi.fn().mockResolvedValue(''),
        });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({ success: false, error: 'Network error' });
      expect(mockDeps.logger.error).toHaveBeenCalled();
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Scheduling retry',
        expect.objectContaining({ nextAttempt: 2 }),
      );
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('retries up to 3 times then gives up', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({
        success: false,
        error: 'Persistent error',
      });
      await vi.runAllTimersAsync();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(vi.getTimerCount()).toBe(0);
      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({
              operation: 'finalFailure',
              retryCount: 3,
            }),
          }),
        }),
      );
      expect(mockDeps.tracer.endTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            totalRetries: 3,
          }),
        }),
      );
    });

    it('calculates exponential backoff delays correctly', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
        retryCount: 0,
      });
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.runAllTimersAsync();
      mockFetch.mockClear();

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
        retryCount: 1,
      });
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.runAllTimersAsync();
      mockFetch.mockClear();

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
        retryCount: 2,
      });
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(3999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('handles API error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DataLake API error: 500');
      expect(mockDeps.logger.error).toHaveBeenCalled();
    });

    it('handles API 4xx error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request'),
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'INVALID',
        isTestnet: false,
        context: mockContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DataLake API error: 400');
    });

    it('logs all retry attempts correctly', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Starting order report',
        expect.objectContaining({ attempt: 1, maxAttempts: 4 }),
      );
    });

    it('uses custom trace ID when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
        _traceId: 'custom-trace-id',
      });

      expect(mockDeps.tracer.endTrace).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'custom-trace-id' }),
      );
    });

    it('reports close action with TP/SL prices', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      await dataLakeService.reportOrder({
        action: 'close',
        symbol: 'BTC',
        slPrice: 45000,
        tpPrice: 55000,
        isTestnet: false,
        context: mockContext,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            user_id: mockEvmAccount.address,
            symbol: 'BTC',
            sl_price: 45000,
            tp_price: 55000,
          }),
        }),
      );
    });

    it('reports order without TP/SL prices when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'ETH',
        isTestnet: false,
        context: mockContext,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            user_id: mockEvmAccount.address,
            symbol: 'ETH',
            sl_price: undefined,
            tp_price: undefined,
          }),
        }),
      );
    });

    it('handles response with body text', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue('{"orderId": "123"}'),
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({ success: true });
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Order reported successfully',
        expect.objectContaining({ responseBody: '{"orderId": "123"}' }),
      );
    });

    it('handles empty response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
      });

      expect(result).toEqual({ success: true });
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'DataLake API: Order reported successfully',
        expect.objectContaining({ responseBody: 'empty' }),
      );
    });

    it('only starts trace on first attempt', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(''),
      });

      await dataLakeService.reportOrder({
        action: 'open',
        symbol: 'BTC',
        isTestnet: false,
        context: mockContext,
        retryCount: 2,
      });

      expect(mockDeps.tracer.trace).not.toHaveBeenCalled();
    });
  });
});
