import { StatusTypes } from '@metamask/bridge-controller';

import { BridgeStatusService } from './bridge-status-service';
import { BridgeClientId } from '../types';
import type {
  StatusRequestWithSrcTxHash,
  StatusResponse,
  FetchFunction,
} from '../types';

const mockStatusRequest: StatusRequestWithSrcTxHash = {
  bridgeId: 'socket',
  srcTxHash:
    '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
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
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      icon: undefined,
      assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
    },
    srcTokenAmount: '1000000000000000000',
    destAsset: {
      chainId: 137,
      address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: undefined,
      assetId: 'eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    },
    destTokenAmount: '2500000000',
    feeData: {
      metabridge: {
        amount: '100000000000000000',
        asset: {
          chainId: 1,
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
          icon: 'eth.jpeg',
          assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
        },
      },
    },
    steps: [],
  },
};

const mockStatusResponse: StatusResponse = {
  status: StatusTypes.PENDING,
  bridge: 'socket',
  srcChain: {
    chainId: 1,
    txHash:
      '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
    amount: '1000000000000000000',
    token: {
      address: '0x0000000000000000000000000000000000000000',
      assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
      chainId: 1,
      symbol: 'ETH',
      decimals: 18,
      name: 'Ether',
      icon: 'https://media.socket.tech/tokens/all/ETH',
    },
  },
  destChain: {
    chainId: 137,
    token: {},
  },
};

const mockCompleteStatusResponse: StatusResponse = {
  status: StatusTypes.COMPLETE,
  bridge: 'socket',
  srcChain: {
    chainId: 1,
    txHash:
      '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
    amount: '1000000000000000000',
    token: {
      address: '0x0000000000000000000000000000000000000000',
      assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
      chainId: 1,
      symbol: 'ETH',
      decimals: 18,
      name: 'Ether',
      icon: 'https://media.socket.tech/tokens/all/ETH',
    },
  },
  destChain: {
    chainId: 137,
    txHash:
      '0x456def789abc123def456abc789def123456abc789def123456abc789def1234',
    amount: '2500000000',
    token: {
      address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      assetId: 'eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      chainId: 137,
      symbol: 'USDC',
      decimals: 6,
      name: 'USD Coin',
      icon: 'https://media.socket.tech/tokens/all/USDC',
    },
  },
};

jest.setTimeout(8000);

describe('BridgeStatusService', () => {
  const bridgeApiBaseUrl = 'https://bridge-api.test.com';
  const networkError = new Error('Network error');

  describe('onBreak', () => {
    it('should register a listener that is called when the circuit opens', async () => {
      const onBreak = jest.fn();
      const mockFetch = createMockFetch({ error: networkError });

      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        maximumConsecutiveFailures: 1,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });
      bridgeStatusService.onBreak(onBreak);

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(onBreak).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    it('should register a listener that is called when the request is slow', async () => {
      const onDegraded = jest.fn();
      const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)
      // Mock fetch to take a long time
      const mockSlowFetch = createMockFetch({
        response: mockStatusResponse,
        delay: slowFetchTime,
      });

      const bridgeStatusService = new BridgeStatusService({
        fetch: mockSlowFetch,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });
      bridgeStatusService.onDegraded(onDegraded);

      await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      // Verify the degraded callback was called
      expect(onDegraded).toHaveBeenCalled();
    }, 7000);
  });

  describe('fetchBridgeStatus', () => {
    it('fetches successfully and returns bridge status', async () => {
      const mockFetch = createMockFetch({
        response: mockStatusResponse,
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      const result =
        await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${bridgeApiBaseUrl}/getTxStatus`),
        {
          headers: {
            'X-Client-Id': BridgeClientId.EXTENSION,
          },
        },
      );

      expect(result).toStrictEqual(mockStatusResponse);
    });

    it('fetches successfully with complete status', async () => {
      const mockFetch = createMockFetch({
        response: mockCompleteStatusResponse,
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.MOBILE,
          bridgeApiBaseUrl,
        },
      });

      const result =
        await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${bridgeApiBaseUrl}/getTxStatus`),
        {
          headers: {
            'X-Client-Id': BridgeClientId.MOBILE,
          },
        },
      );

      expect(result).toStrictEqual(mockCompleteStatusResponse);
      expect(result.status).toBe(StatusTypes.COMPLETE);
      expect(result.destChain?.txHash).toBeDefined();
    });

    it('includes correct query parameters in the request URL', async () => {
      const mockFetch = createMockFetch({
        response: mockStatusResponse,
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(callUrl);
      const { searchParams } = url;

      expect(searchParams.get('bridgeId')).toBe('socket');
      expect(searchParams.get('srcTxHash')).toBe(
        '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
      );
      expect(searchParams.get('bridge')).toBe('socket');
      expect(searchParams.get('srcChainId')).toBe('1');
      expect(searchParams.get('destChainId')).toBe('137');
      expect(searchParams.get('refuel')).toBe('false');
      expect(searchParams.get('requestId')).toBe('req-123');
    });

    it('throws an error when the API request fails', async () => {
      const mockFetch = createMockFetch({ error: networkError });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow(networkError);
    });

    it('throws an error when the network request returns a non-200 status code', async () => {
      const mockFetch = createMockFetch({
        error: new Error('Failed to fetch bridge tx status'),
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow('Failed to fetch bridge tx status');
    });

    it('throws an error when the API returns invalid response structure', async () => {
      const invalidResponse = {
        ...mockStatusResponse,
        status: 'foo',
      };
      const mockFetch = createMockFetch({
        response: invalidResponse as unknown as StatusResponse,
      });

      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow(
        'At path: status -- Expected one of `"UNKNOWN","FAILED","PENDING","COMPLETE"`, but received: "foo"',
      );
    });

    it('retries the fetch the specified number of times on failure', async () => {
      const mockFetch = createMockFetch({ error: networkError });
      const maxRetries = 3;
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: maxRetries,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow(networkError);
      // Check that fetch was retried the correct number of times
      expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
    });

    it('should call the onBreak callback when the circuit opens', async () => {
      const onBreak = jest.fn();
      const mockFetch = createMockFetch({ error: networkError });

      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        maximumConsecutiveFailures: 1,
        onBreak,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl,
        },
      });

      await expect(
        bridgeStatusService.fetchBridgeStatus(mockStatusRequest),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(onBreak).toHaveBeenCalled();
    });

    it('should call the onDegraded callback when the request is slow', async () => {
      const onDegraded = jest.fn();
      const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)
      // Mock fetch to take a long time
      const mockSlowFetch = createMockFetch({
        response: mockStatusResponse,
        delay: slowFetchTime,
      });

      const bridgeStatusService = new BridgeStatusService({
        fetch: mockSlowFetch,
        onDegraded,
        config: {
          clientId: BridgeClientId.MOBILE,
          bridgeApiBaseUrl,
        },
      });

      await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      // Verify the degraded callback was called
      expect(onDegraded).toHaveBeenCalled();
    }, 7000);

    it('works with different bridge client IDs', async () => {
      const mockFetch = createMockFetch({
        response: mockStatusResponse,
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.MOBILE,
          bridgeApiBaseUrl,
        },
      });

      await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${bridgeApiBaseUrl}/getTxStatus`),
        {
          headers: {
            'X-Client-Id': BridgeClientId.MOBILE,
          },
        },
      );
    });

    it('handles different bridge API base URLs', async () => {
      const customApiUrl = 'https://custom.bridge.api';
      const mockFetch = createMockFetch({
        response: mockStatusResponse,
      });
      const bridgeStatusService = new BridgeStatusService({
        fetch: mockFetch,
        retries: 0,
        config: {
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl: customApiUrl,
        },
      });

      await bridgeStatusService.fetchBridgeStatus(mockStatusRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${customApiUrl}/getTxStatus`),
        {
          headers: {
            'X-Client-Id': BridgeClientId.EXTENSION,
          },
        },
      );
    });
  });
});

/**
 * Creates a mock fetch function that matches the project's fetchFn pattern.
 * The fetchFn automatically handles HTTP status checking and JSON parsing,
 * throwing errors for non-ok responses and returning parsed JSON directly.
 *
 * @param params - Configuration parameters
 * @param params.response - The parsed response data to return directly
 * @param params.error - Error to reject with (if provided, mock will reject instead of resolve)
 * @param params.delay - Delay in milliseconds before resolving/rejecting
 * @returns A Jest mock function that returns parsed JSON directly or throws errors
 */
function createMockFetch({
  response,
  error,
  delay = 0,
}: {
  response?: StatusResponse;
  error?: Error;
  delay?: number;
}): jest.MockedFunction<FetchFunction> {
  if (error) {
    return jest
      .fn()
      .mockImplementation(
        () =>
          new Promise((_, reject) => setTimeout(() => reject(error), delay)),
      );
  }

  // Return the parsed JSON response directly (fetchFn handles .json() internally)
  return jest
    .fn()
    .mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(response), delay)),
    );
}
