import {
  fetchBridgeTxStatus,
  getBridgeStatusUrl,
  getStatusRequestDto,
} from './bridge-status';
import { BRIDGE_PROD_API_BASE_URL } from '../constants';
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
        mockFetch,
        BRIDGE_PROD_API_BASE_URL,
      );

      // Verify the fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(getBridgeStatusUrl(BRIDGE_PROD_API_BASE_URL)),
        {
          headers: { 'X-Client-Id': mockClientId },
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
      expect(result).toStrictEqual(mockValidResponse);
    });

    it('should throw error when response validation fails', async () => {
      const invalidResponse = {
        invalid: 'response',
      };

      const mockFetch: FetchFunction = jest
        .fn()
        .mockResolvedValue(invalidResponse);

      await expect(
        fetchBridgeTxStatus(
          mockStatusRequest,
          mockClientId,
          mockFetch,
          BRIDGE_PROD_API_BASE_URL,
        ),
        // eslint-disable-next-line jest/require-to-throw-message
      ).rejects.toThrow();
    });

    it('should handle fetch errors', async () => {
      const mockFetch: FetchFunction = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await expect(
        fetchBridgeTxStatus(
          mockStatusRequest,
          mockClientId,
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
});
