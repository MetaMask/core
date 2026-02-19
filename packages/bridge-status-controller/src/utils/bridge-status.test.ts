import {
  fetchBridgeTxStatus,
  getBridgeStatusUrl,
  getStatusRequestDto,
  shouldSkipFetchDueToFetchFailures,
} from './bridge-status';
import { BRIDGE_PROD_API_BASE_URL, REFRESH_INTERVAL_MS } from '../constants';
import { BridgeClientId } from '../types';
import type { StatusRequestWithSrcTxHash, FetchFunction } from '../types';

describe('utils', () => {
  const mockStatusRequest: StatusRequestWithSrcTxHash = {
    bridgeId: 'socket',
    srcTxHash: '0x123',
    bridge: 'socket',
    srcChainId: 1,
    destChainId: 137,
    refuel: false,
    quote: {
      requestId: 'req-123',
      bridgeId: 'socket',
      bridges: ['socket'],
      srcChainId: 1,
      destChainId: 137,
      srcAsset: {
        chainId: 1,
        address: '0x123',
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        icon: undefined,
        assetId: 'eip155:1/erc20:0x123',
      },
      srcTokenAmount: '',
      destAsset: {
        chainId: 137,
        address: '0x456',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        icon: undefined,
        assetId: 'eip155:137/erc20:0x456',
      },
      destTokenAmount: '',
      minDestTokenAmount: '',
      feeData: {
        metabridge: {
          amount: '100',
          asset: {
            chainId: 1,
            address: '0x123',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            icon: 'eth.jpeg',
            assetId: 'eip155:1/erc20:0x123',
          },
        },
      },
      steps: [],
    },
  };

  const mockValidResponse = {
    status: 'PENDING',
    srcChain: {
      chainId: 1,
      txHash: '0x123',
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
        chainId: 1,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2518.47',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: 137,
      token: {},
    },
  };

  describe('fetchBridgeTxStatus', () => {
    const mockClientId = BridgeClientId.EXTENSION;

    it('should successfully fetch and validate bridge transaction status', async () => {
      const mockFetch: FetchFunction = jest
        .fn()
        .mockResolvedValue(mockValidResponse);

      const result = await fetchBridgeTxStatus(
        mockStatusRequest,
        mockClientId,
        'AUTH_TOKEN',
        mockFetch,
        BRIDGE_PROD_API_BASE_URL,
      );

      // Verify the fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(getBridgeStatusUrl(BRIDGE_PROD_API_BASE_URL)),
        {
          headers: {
            'X-Client-Id': mockClientId,
            Authorization: 'Bearer AUTH_TOKEN',
          },
        },
      );

      // Verify URL contains all required parameters
      const callUrl = (mockFetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain(`bridgeId=${mockStatusRequest.bridgeId}`);
      expect(callUrl).toContain(`srcTxHash=${mockStatusRequest.srcTxHash}`);
      expect(callUrl).toContain(
        `requestId=${mockStatusRequest.quote?.requestId}`,
      );

      // Verify responsev
      expect(result.status).toStrictEqual(mockValidResponse);
      expect(result.validationFailures).toStrictEqual([]);
    });

    it('should validate invalid bridge transaction status', async () => {
      const mockInvalidResponse = {
        ...mockValidResponse,
        status: 'INVALID',
      };
      const mockFetch: FetchFunction = jest
        .fn()
        .mockResolvedValue(mockInvalidResponse);

      const result = await fetchBridgeTxStatus(
        mockStatusRequest,
        mockClientId,
        'AUTH_TOKEN',
        mockFetch,
        BRIDGE_PROD_API_BASE_URL,
      );

      // Verify the fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(getBridgeStatusUrl(BRIDGE_PROD_API_BASE_URL)),
        {
          headers: {
            'X-Client-Id': mockClientId,
            Authorization: 'Bearer AUTH_TOKEN',
          },
        },
      );

      // Verify URL contains all required parameters
      const callUrl = (mockFetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain(`bridgeId=${mockStatusRequest.bridgeId}`);
      expect(callUrl).toContain(`srcTxHash=${mockStatusRequest.srcTxHash}`);
      expect(callUrl).toContain(
        `requestId=${mockStatusRequest.quote?.requestId}`,
      );

      // Verify response
      expect(result.status).toStrictEqual(mockInvalidResponse);
      expect(result.validationFailures).toMatchInlineSnapshot(`
        [
          "socket|status",
        ]
      `);
    });

    it('should throw error when response validation fails', async () => {
      const invalidResponse = {
        invalid: 'response',
      };

      const mockFetch: FetchFunction = jest
        .fn()
        .mockResolvedValue(invalidResponse);

      const result = await fetchBridgeTxStatus(
        mockStatusRequest,
        mockClientId,
        'AUTH_TOKEN',
        mockFetch,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(result.status).toStrictEqual(invalidResponse);
      expect(result.validationFailures).toMatchInlineSnapshot(
        ['socket|status', 'socket|srcChain'],
        `
        [
          "socket|status",
          "socket|srcChain",
        ]
      `,
      );
    });

    it('should handle fetch errors', async () => {
      const mockFetch: FetchFunction = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await expect(
        fetchBridgeTxStatus(
          mockStatusRequest,
          mockClientId,
          'AUTH_TOKEN',
          mockFetch,
          BRIDGE_PROD_API_BASE_URL,
        ),
      ).rejects.toThrow('Network error');
    });
  });

  describe('getStatusRequestDto', () => {
    it('should handle status request with quote', () => {
      const result = getStatusRequestDto(mockStatusRequest);

      expect(result).toStrictEqual({
        bridgeId: 'socket',
        srcTxHash: '0x123',
        bridge: 'socket',
        srcChainId: '1',
        destChainId: '137',
        refuel: 'false',
        requestId: 'req-123',
      });
    });

    it('should handle status request without quote', () => {
      const statusRequestWithoutQuote = {
        ...mockStatusRequest,
        quote: undefined,
      };

      const result = getStatusRequestDto(statusRequestWithoutQuote);

      expect(result).toStrictEqual({
        bridgeId: 'socket',
        srcTxHash: '0x123',
        bridge: 'socket',
        srcChainId: '1',
        destChainId: '137',
        refuel: 'false',
      });
      expect(result).not.toHaveProperty('requestId');
    });
  });

  describe('shouldSkipFetchDueToFetchFailures', () => {
    const mockCurrentTime = 1_000_000; // Fixed timestamp for testing
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockCurrentTime);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    it('should return false if attempts is undefined', () => {
      const result = shouldSkipFetchDueToFetchFailures(undefined);
      expect(result).toBe(false);
    });

    it('should return false if enough time has passed since last attempt', () => {
      // For counter = 1, backoff delay = REFRESH_INTERVAL_MS * 2^(1-1) = 10 seconds
      const backoffDelay = REFRESH_INTERVAL_MS; // 10 seconds = 10,000ms
      const lastAttemptTime = mockCurrentTime - backoffDelay - 1000; // 1 second past the backoff delay

      const attempts = {
        counter: 1,
        lastAttemptTime,
      };

      const result = shouldSkipFetchDueToFetchFailures(attempts);
      expect(result).toBe(false);
    });

    it('should return true if not enough time has passed since last attempt', () => {
      // For counter = 1, backoff delay = REFRESH_INTERVAL_MS * 2^(1-1) = 10 seconds
      const backoffDelay = REFRESH_INTERVAL_MS; // 10 seconds = 10,000ms
      const lastAttemptTime = mockCurrentTime - backoffDelay + 1000; // 1 second before the backoff delay elapses

      const attempts = {
        counter: 1,
        lastAttemptTime,
      };

      const result = shouldSkipFetchDueToFetchFailures(attempts);
      expect(result).toBe(true);
    });

    it('should calculate correct exponential backoff for different attempt counters', () => {
      // Test counter = 2: backoff delay = REFRESH_INTERVAL_MS * 2^(2-1) = 20 seconds
      const backoffDelay2 = REFRESH_INTERVAL_MS * 2; // 20 seconds = 20,000ms
      const lastAttemptTime2 = mockCurrentTime - backoffDelay2 + 5000; // 5 seconds before delay elapses

      const attempts2 = {
        counter: 2,
        lastAttemptTime: lastAttemptTime2,
      };

      expect(shouldSkipFetchDueToFetchFailures(attempts2)).toBe(true);

      // Test counter = 3: backoff delay = REFRESH_INTERVAL_MS * 2^(3-1) = 40 seconds
      const backoffDelay3 = REFRESH_INTERVAL_MS * 4; // 40 seconds = 40,000ms
      const lastAttemptTime3 = mockCurrentTime - backoffDelay3 - 1000; // 1 second past delay

      const attempts3 = {
        counter: 3,
        lastAttemptTime: lastAttemptTime3,
      };

      expect(shouldSkipFetchDueToFetchFailures(attempts3)).toBe(false);
    });

    it('should handle edge case where time since last attempt equals backoff delay', () => {
      // For counter = 1, backoff delay = REFRESH_INTERVAL_MS * 2^(1-1) = 10 seconds
      const backoffDelay = REFRESH_INTERVAL_MS;
      const lastAttemptTime = mockCurrentTime - backoffDelay; // Exactly at the backoff delay

      const attempts = {
        counter: 1,
        lastAttemptTime,
      };

      // When time since last attempt equals backoff delay, it should not skip (return false)
      const result = shouldSkipFetchDueToFetchFailures(attempts);
      expect(result).toBe(false);
    });
  });
});
