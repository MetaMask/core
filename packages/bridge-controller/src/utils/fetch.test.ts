import { AddressZero } from '@ethersproject/constants';
import type { CaipAssetType } from '@metamask/utils';

import {
  fetchBridgeQuotes,
  fetchBridgeTokens,
  fetchAssetPrices,
} from './fetch';
import mockBridgeQuotesErc20Erc20 from '../../tests/mock-quotes-erc20-erc20.json';
import mockBridgeQuotesNativeErc20 from '../../tests/mock-quotes-native-erc20.json';
import { BridgeClientId, BRIDGE_PROD_API_BASE_URL } from '../constants/bridge';

const mockFetchFn = jest.fn();

describe('fetch', () => {
  describe('fetchBridgeTokens', () => {
    it('should fetch bridge tokens successfully', async () => {
      const mockResponse = [
        {
          address: '0x0000000000000000000000000000000000000000',
          assetId: 'eip155:10/slip44:614',
          symbol: 'ETH',
          decimals: 18,
          name: 'Ether',
          coingeckoId: 'ethereum',
          aggregators: [],
          iconUrl:
            'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/native/614.png',
          metadata: {
            honeypotStatus: {},
            isContractVerified: false,
            erc20Permit: false,
            description: {},
            createdAt: '2023-10-31T22:16:37.494Z',
          },
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          symbol: 'ABC',
          name: 'ABC',
          decimals: 16,
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f985',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f985',
          decimals: 16,
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          decimals: 16,
          symbol: 'DEF',
          name: 'DEF',
          aggregators: ['lifi'],
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f987',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f987',
          symbol: 'DEF',
          chainId: 10,
        },
        {
          address: '0x124',
          assetId: 'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
          symbol: 'JKL',
          decimals: 16,
          chainId: 10,
        },
      ];

      mockFetchFn.mockResolvedValue(mockResponse);

      const result = await fetchBridgeTokens(
        '0xa',
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getTokens?chainId=10',
        {
          cacheOptions: {
            cacheRefreshTime: 600000,
          },
          functionName: 'fetchBridgeTokens',
          headers: { 'X-Client-Id': 'extension' },
        },
      );

      expect(result).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          address: '0x0000000000000000000000000000000000000000',
          aggregators: [],
          assetId: 'eip155:10/slip44:614',
          chainId: 10,
          coingeckoId: 'ethereum',
          decimals: 18,
          iconUrl:
            'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/native/614.png',
          metadata: {
            createdAt: '2023-10-31T22:16:37.494Z',
            description: {},
            erc20Permit: false,
            honeypotStatus: {},
            isContractVerified: false,
          },
          name: 'Ether',
          symbol: 'ETH',
        },
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986': {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          chainId: 10,
          decimals: 16,
          name: 'DEF',
          symbol: 'DEF',
          aggregators: ['lifi'],
        },
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          chainId: 10,
          decimals: 16,
          name: 'ABC',
          symbol: 'ABC',
        },
      });
    });

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch');

      mockFetchFn.mockRejectedValue(mockError);

      await expect(
        fetchBridgeTokens(
          '0xa',
          BridgeClientId.EXTENSION,
          mockFetchFn,
          BRIDGE_PROD_API_BASE_URL,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe('fetchBridgeQuotes', () => {
    it('should fetch bridge quotes successfully, no approvals', async () => {
      mockFetchFn.mockResolvedValue(mockBridgeQuotesNativeErc20);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesNativeErc20);
    });

    it('should fetch bridge quotes successfully, with approvals', async () => {
      mockFetchFn.mockResolvedValue([
        ...mockBridgeQuotesErc20Erc20,
        { ...mockBridgeQuotesErc20Erc20[0], approval: null },
        { ...mockBridgeQuotesErc20Erc20[0], trade: null },
      ]);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesErc20Erc20);
    });

    it('should filter out malformed bridge quotes', async () => {
      mockFetchFn.mockResolvedValue([
        ...mockBridgeQuotesErc20Erc20,
        ...mockBridgeQuotesErc20Erc20.map(
          ({ quote, ...restOfQuote }) => restOfQuote,
        ),
        {
          ...mockBridgeQuotesErc20Erc20[0],
          quote: {
            srcAsset: {
              ...mockBridgeQuotesErc20Erc20[0].quote.srcAsset,
              decimals: undefined,
            },
          },
        },
        {
          ...mockBridgeQuotesErc20Erc20[1],
          quote: {
            srcAsset: {
              ...mockBridgeQuotesErc20Erc20[1].quote.destAsset,
              address: undefined,
            },
          },
        },
      ]);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesErc20Erc20);
    });
  });

  describe('fetchAssetPrices', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch and combine prices for multiple currencies successfully', async () => {
      mockFetchFn
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { USD: '1.5' },
          'eip155:1/erc20:0x456': { USD: '2.5' },
        })
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { JPY: '1.3' },
          'eip155:1/erc20:0x456': null,
        })
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { EUR: '1.3' },
          'eip155:1/erc20:0x456': { EUR: '2.2' },
        });

      const request = {
        currencies: new Set(['USD', 'JPY', 'EUR']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          USD: '1.5',
          JPY: '1.3',
          EUR: '1.3',
        },
        'eip155:1/erc20:0x456': {
          USD: '2.5',
          EUR: '2.2',
        },
      });

      expect(mockFetchFn).toHaveBeenCalledTimes(3);
      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://price.api.cx.metamask.io/v3/spot-prices?assetIds=eip155%3A1%2Ferc20%3A0x123%2Ceip155%3A1%2Ferc20%3A0x456&vsCurrency=USD',
        {
          headers: { 'X-Client-Id': 'test' },
          cacheOptions: { cacheRefreshTime: 30000 },
          functionName: 'fetchAssetExchangeRates',
        },
      );
      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://price.api.cx.metamask.io/v3/spot-prices?assetIds=eip155%3A1%2Ferc20%3A0x123%2Ceip155%3A1%2Ferc20%3A0x456&vsCurrency=EUR',
        {
          headers: { 'X-Client-Id': 'test' },
          cacheOptions: { cacheRefreshTime: 30000 },
          functionName: 'fetchAssetExchangeRates',
        },
      );
    });

    it('should handle empty currencies set', async () => {
      const request = {
        currencies: new Set<string>(),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({});
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should handle failed requests for some currencies', async () => {
      mockFetchFn
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { USD: '1.5' },
        })
        .mockRejectedValueOnce(new Error('Failed to fetch EUR prices'));

      const request = {
        currencies: new Set(['USD', 'EUR']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          USD: '1.5',
        },
      });

      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should handle all failed requests', async () => {
      mockFetchFn.mockRejectedValue(new Error('Failed to fetch prices'));

      const request = {
        currencies: new Set(['USD', 'EUR']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({});
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should merge prices for same asset from different currencies', async () => {
      mockFetchFn
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { USD: '1.5' },
          'eip155:1/erc20:0x456': null,
        })
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { GBP: '1.2' },
          'eip155:1/erc20:0x456': null,
        })
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { JPY: '165' },
          'eip155:1/erc20:0x456': null,
        })
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { EUR: '1.3' },
          'eip155:1/erc20:0x456': null,
        });

      const request = {
        currencies: new Set(['USD', 'GBP', 'JPY', 'EUR']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          USD: '1.5',
          GBP: '1.2',
          EUR: '1.3',
          JPY: '165',
        },
      });
    });

    it('should handle mixed successful and empty responses', async () => {
      mockFetchFn
        .mockResolvedValueOnce({
          'eip155:1/erc20:0x123': { USD: '1.5' },
        })
        .mockResolvedValueOnce({});

      const request = {
        currencies: new Set(['USD', 'EUR']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          USD: '1.5',
        },
      });
    });

    it('should handle malformed API responses', async () => {
      mockFetchFn
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('invalid format');

      const request = {
        currencies: new Set(['USD', 'EUR', 'GBP']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({});
      expect(mockFetchFn).toHaveBeenCalledTimes(3);
    });

    it('should handle empty assetIds', async () => {
      const request = {
        currencies: new Set(['USD', 'EUR', 'GBP']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({});
      expect(mockFetchFn).toHaveBeenCalledTimes(0);
    });

    it('should handle network errors with appropriate status codes', async () => {
      mockFetchFn
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockRejectedValueOnce(new Error('Network Error'));

      const request = {
        currencies: new Set(['USD', 'EUR', 'GBP']),
        baseUrl: 'https://api.example.com',
        fetchFn: mockFetchFn,
        clientId: 'test',
        assetIds: new Set([
          'eip155:1/erc20:0x123',
          'eip155:1/erc20:0x456',
        ]) as Set<CaipAssetType>,
      };

      const result = await fetchAssetPrices(request);

      expect(result).toStrictEqual({});
      expect(mockFetchFn).toHaveBeenCalledTimes(3);
    });
  });
});
